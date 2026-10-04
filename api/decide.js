module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "TYPESAFE_API_KEY is not configured." });
  }

  const body = req.body || {};
  const context = typeof body.context === "string" ? body.context.trim() : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const rawOptions = Array.isArray(body.options) ? body.options : [];

  if (!question) {
    return res.status(400).json({ error: "سؤال القرار مطلوب." });
  }
  if (question.length > 2000) {
    return res.status(400).json({ error: "سؤال القرار طويل جدًا." });
  }
  if (context.length > 20000) {
    return res.status(400).json({ error: "السياق طويل جدًا لهذه التجربة." });
  }
  if (rawOptions.length < 2) {
    return res.status(400).json({ error: "يجب توفير خيارين على الأقل." });
  }
  if (rawOptions.length > 12) {
    return res.status(400).json({ error: "هذه الواجهة تدعم حتى 12 خيارًا." });
  }

  const options = rawOptions.map((item) => ({
    label: typeof item?.label === "string" ? item.label.trim() : "",
    description: typeof item?.description === "string" ? item.description.trim() : ""
  }));

  if (options.some((o) => !o.label)) {
    return res.status(400).json({ error: "كل خيار يجب أن يحتوي على اسم." });
  }
  if (options.some((o) => o.label.length > 120 || o.description.length > 1000)) {
    return res.status(400).json({ error: "أحد الخيارات أو أوصافه أطول من الحد المسموح." });
  }

  const normalized = options.map((o) => o.label.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return res.status(400).json({ error: "أسماء الخيارات يجب أن تكون مختلفة." });
  }

  const reserved = new Set(["__proto__", "prototype", "constructor"]);
  if (options.some((o) => reserved.has(o.label))) {
    return res.status(400).json({ error: "اسم خيار غير مسموح." });
  }

  const criteria = Object.create(null);
  for (const option of options) {
    criteria[option.label] = option.description || null;
  }

  const state = context || "No additional context was provided. Base the decision on the question and option criteria.";

  try {
    const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "jev-latest",
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
        typeof data?.detail === "string" ? data.detail :
        data?.detail ? JSON.stringify(data.detail) :
        data?.message || `TypeSafe API returned ${upstream.status}`;
      return res.status(upstream.status).json({ error: detail });
    }

    const answer = data?.answers?.decision;
    if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") {
      return res.status(502).json({ error: "استجابة غير متوقعة من JEV." });
    }

    return res.status(200).json({
      decision: answer.choice,
      confidence: Number(answer.confidence || 0),
      probabilities: answer.probabilities || {},
      options: options.map((o) => o.label),
      model: data.model,
      usage: data.usage || {}
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
};