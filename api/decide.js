module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "TYPESAFE_API_KEY is not configured." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "اكتب نصًا أولاً." });
  }
  if (text.length > 12000) {
    return res.status(400).json({ error: "النص طويل جدًا لهذه التجربة." });
  }

  try {
    const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: text,
        questions: {
          decision: {
            type: "choice",
            instructions: "Choose the best operational decision for the supplied user text. Decide whether software should proceed, require human review, or reject the proposed action.",
            criteria: {
              execute: "The action is clear enough and reasonable to carry out as stated without additional review.",
              review: "The text is ambiguous, incomplete, uncertain, or should be checked by a human before acting.",
              reject: "The action should not be carried out based on the supplied text because it is clearly unsuitable, contradictory, or inappropriate."
            }
          }
        }
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = data?.detail
        ? JSON.stringify(data.detail)
        : data?.message || `TypeSafe API returned ${upstream.status}`;
      return res.status(upstream.status).json({ error: detail });
    }

    const answer = data?.answers?.decision;
    if (!answer || answer.type !== "choice") {
      return res.status(502).json({ error: "Unexpected response from JEV." });
    }

    return res.status(200).json({
      decision: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      model: data.model,
      usage: data.usage
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
};