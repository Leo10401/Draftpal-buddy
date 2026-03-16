import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || "";

const geminiClient = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const DEFAULT_GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL = process.env.NEXT_PUBLIC_OPENROUTER_MODEL || "";

const baseModelOptions = [
  {
    key: `gemini/${DEFAULT_GEMINI_MODEL}`,
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    label: `Gemini (${DEFAULT_GEMINI_MODEL})`,
  },
];

if (DEFAULT_OPENROUTER_MODEL) {
  baseModelOptions.push({
    key: `openrouter/${DEFAULT_OPENROUTER_MODEL}`,
    provider: "openrouter",
    model: DEFAULT_OPENROUTER_MODEL,
    label: `OpenRouter (${DEFAULT_OPENROUTER_MODEL})`,
  });
}

export const AI_MODEL_OPTIONS = baseModelOptions;

function getModelConfigByKey(key) {
  const found = AI_MODEL_OPTIONS.find((option) => option.key === key);
  if (found) {
    return found;
  }

  const [provider, ...rest] = String(key || "").split("/");
  if (provider && rest.length) {
    return { key, provider, model: rest.join("/") };
  }

  return AI_MODEL_OPTIONS[0] || { key: `gemini/${DEFAULT_GEMINI_MODEL}`, provider: "gemini", model: DEFAULT_GEMINI_MODEL };
}

async function generateWithGemini(model, prompt) {
  if (!geminiClient) {
    throw new Error("Gemini API key is missing. Set NEXT_PUBLIC_GEMINI_API_KEY.");
  }

  const generationModel = geminiClient.getGenerativeModel({ model });
  const result = await generationModel.generateContent(prompt);
  return result.response.text();
}

async function generateWithOpenRouter(model, prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key is missing. Set NEXT_PUBLIC_OPENROUTER_API_KEY.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL } : {}),
      ...(process.env.NEXT_PUBLIC_SITE_NAME ? { "X-Title": process.env.NEXT_PUBLIC_SITE_NAME } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || `OpenRouter request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  }

  throw new Error("OpenRouter returned an empty response.");
}

async function generateWithProvider({ provider, model }, prompt) {
  if (provider === "openrouter") {
    return generateWithOpenRouter(model, prompt);
  }

  return generateWithGemini(model, prompt);
}

export async function generateTemplateText(prompt, preferredModelKey) {
  const preferred = getModelConfigByKey(preferredModelKey);
  const fallback = preferred.provider === "openrouter"
    ? { key: `gemini/${DEFAULT_GEMINI_MODEL}`, provider: "gemini", model: DEFAULT_GEMINI_MODEL }
    : (DEFAULT_OPENROUTER_MODEL
      ? { key: `openrouter/${DEFAULT_OPENROUTER_MODEL}`, provider: "openrouter", model: DEFAULT_OPENROUTER_MODEL }
      : null);

  const attempts = [preferred, fallback].filter(Boolean).filter(
    (item, index, arr) => arr.findIndex((other) => other.provider === item.provider && other.model === item.model) === index
  );

  let lastError;
  for (const attempt of attempts) {
    try {
      return await generateWithProvider(attempt, prompt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to generate AI content with configured providers.");
}
