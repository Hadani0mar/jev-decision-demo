import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

function jsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function errorText(message, details) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: message,
            ...(details ? { details } : {})
          },
          null,
          2
        )
      }
    ]
  };
}

function validateUniqueOptions(options) {
  const seen = new Set();
  for (const option of options) {
    const key = option.label.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate option label: ${option.label}`);
    }
    seen.add(key);
  }
}

async function callJev({ state, question, options }) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY is not configured on the server.");
  }

  validateUniqueOptions(options);

  const criteria = Object.create(null);
  for (const option of options) {
    criteria[option.label] = option.description?.trim() || null;
  }

  const upstream = await fetch(TYPESAFE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      state,
      questions: {
        decision: {
          type: "choice",
          instructions: question,
          criteria
        }
      }
    })
  });

  const data = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : data?.detail
          ? JSON.stringify(data.detail)
          : data?.message || `TypeSafe API returned HTTP ${upstream.status}`;

    const error = new Error(detail);
    error.status = upstream.status;
    throw error;
  }

  const answer = data?.answers?.decision;
  if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") {
    throw new Error("Unexpected response shape from JEV.");
  }

  return {
    decision: answer.choice,
    confidence: Number(answer.confidence || 0),
    probabilities: answer.probabilities || {},
    model: data.model || MODEL,
    usage: data.usage || {}
  };
}

const optionSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(1500).optional()
});

const handler = createMcpHandler((server) => {
  server.registerTool(
    "jev_decide",
    {
      title: "JEV Decide",
      description:
        "Ask JEV to choose one bounded option from explicit criteria. Use this as a decision gate inside an agentic loop, not as a general text-generation tool.",
      inputSchema: z.object({
        state: z.string().min(1).max(30000),
        question: z.string().min(1).max(2000),
        options: z.array(optionSchema).min(2).max(12)
      })
    },
    async ({ state, question, options }) => {
      try {
        const result = await callJev({ state, question, options });
        return jsonText(result);
      } catch (error) {
        return errorText(
          "JEV decision failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );

  server.registerTool(
    "jev_route",
    {
      title: "JEV Route",
      description:
        "Choose the best next route, specialist, or investigation path for the current agent state.",
      inputSchema: z.object({
        state: z.string().min(1).max(30000),
        objective: z.string().min(1).max(1500),
        routes: z.array(optionSchema).min(2).max(12)
      })
    },
    async ({ state, objective, routes }) => {
      try {
        const result = await callJev({
          state,
          question: `Select the best next route to achieve this objective: ${objective}`,
          options: routes
        });
        return jsonText(result);
      } catch (error) {
        return errorText(
          "JEV routing failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );

  server.registerTool(
    "jev_risk",
    {
      title: "JEV Risk Gate",
      description:
        "Classify whether an agent action is safe to execute automatically or needs review/approval.",
      inputSchema: z.object({
        action: z.string().min(1).max(4000),
        context: z.string().max(20000).optional()
      })
    },
    async ({ action, context = "" }) => {
      try {
        const state = [
          "Proposed agent action:",
          action,
          context ? "\nOperational context:\n" + context : ""
        ].join("\n");

        const result = await callJev({
          state,
          question:
            "Classify the operational risk of the proposed action and select the required execution gate.",
          options: [
            {
              label: "SAFE_AUTOMATIC",
              description:
                "Low-risk, reversible, non-destructive action that can proceed automatically."
            },
            {
              label: "REVIEW_REQUIRED",
              description:
                "Action should be reviewed by another agent or verification step before execution."
            },
            {
              label: "USER_APPROVAL_REQUIRED",
              description:
                "Action changes production state, permissions, money, data, or another consequential resource and should require explicit user approval."
            },
            {
              label: "BLOCK",
              description:
                "Action is unsafe, destructive without adequate safeguards, outside policy, or should not be executed."
            }
          ]
        });

        return jsonText(result);
      } catch (error) {
        return errorText(
          "JEV risk classification failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );

  server.registerTool(
    "jev_approve",
    {
      title: "JEV Completion Gate",
      description:
        "Judge whether a task is ready to finish, should retry, or must escalate based on acceptance criteria and evidence.",
      inputSchema: z.object({
        task: z.string().min(1).max(3000),
        acceptanceCriteria: z.array(z.string().min(1).max(1500)).min(1).max(30),
        evidence: z.string().min(1).max(30000)
      })
    },
    async ({ task, acceptanceCriteria, evidence }) => {
      try {
        const state = [
          `Task: ${task}`,
          "",
          "Acceptance criteria:",
          ...acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`),
          "",
          "Observed evidence:",
          evidence
        ].join("\n");

        const result = await callJev({
          state,
          question:
            "Decide whether the task is ready to finish based only on the acceptance criteria and the provided evidence.",
          options: [
            {
              label: "APPROVE",
              description:
                "Every acceptance criterion is supported by evidence and there is no known blocker."
            },
            {
              label: "RETRY",
              description:
                "At least one acceptance criterion failed, remains unverified, or should be fixed and tested again."
            },
            {
              label: "ESCALATE",
              description:
                "Progress is blocked by missing credentials, missing information, conflicting requirements, or a decision that requires human input."
            }
          ]
        });

        return jsonText(result);
      } catch (error) {
        return errorText(
          "JEV completion gate failed",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );
});

async function protectedHandler(request) {
  const token = process.env.JEV_MCP_TOKEN;

  if (!token) {
    return new Response(
      JSON.stringify({ error: "JEV_MCP_TOKEN is not configured." }),
      {
        status: 503,
        headers: { "content-type": "application/json" }
      }
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${token}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": "Bearer"
      }
    });
  }

  return handler(request);
}

export {
  protectedHandler as GET,
  protectedHandler as POST,
  protectedHandler as DELETE
};
