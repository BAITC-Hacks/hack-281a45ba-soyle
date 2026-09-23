import OpenAI from "openai";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAI({ apiKey }) : null;
}
