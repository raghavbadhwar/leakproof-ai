import 'server-only';

import { GoogleGenAI } from '@google/genai';
import { getServerEnv } from '../env';
import { validateAiConfig } from './config';
import { parseGeminiJsonResponse } from './gemini';

export type GeminiProvenance = {
  provider: 'gemini';
  model: string;
  modelVersion?: string;
  promptVersion: string;
};

export type GenerateGeminiJsonInput = {
  prompt: string;
  systemInstruction: string;
  model?: string;
  promptVersion: string;
};

export type GenerateGeminiJsonResult<T> = {
  data: T;
  provenance: GeminiProvenance;
};

export type EmbedGeminiContentInput = {
  content: string;
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
  title?: string;
};

export type EmbedGeminiContentResult = {
  values: number[];
  provenance: {
    provider: 'gemini';
    model: string;
    dimension: number;
    taskType: EmbedGeminiContentInput['taskType'];
  };
};

export function createGeminiClient(): GoogleGenAI {
  const env = getServerEnv();
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

export async function generateGeminiJson<T>(input: GenerateGeminiJsonInput): Promise<GenerateGeminiJsonResult<T>> {
  const env = getServerEnv();
  const config = validateAiConfig(env);
  const model = input.model ?? config.generation.model;
  const client = createGeminiClient();
  const { response, usedModel } = await generateContentWithFallback(client, {
    model,
    fallbackModel: config.generation.fastModel,
    fallbackEnabled: config.fallbackEnabled,
    prompt: input.prompt,
    systemInstruction: input.systemInstruction
  });

  return {
    data: parseGeminiJsonResponse<T>(response.text),
    provenance: {
      provider: 'gemini',
      model: usedModel,
      modelVersion: response.modelVersion,
      promptVersion: input.promptVersion
    }
  };
}

async function generateContentWithFallback(
  client: GoogleGenAI,
  input: {
    model: string;
    fallbackModel: string;
    fallbackEnabled: boolean;
    prompt: string;
    systemInstruction: string;
  }
) {
  try {
    return {
      response: await generateJsonContent(client, input.model, input.prompt, input.systemInstruction),
      usedModel: input.model
    };
  } catch (error) {
    if (!input.fallbackEnabled || input.model === input.fallbackModel || !isQuotaOrRateLimitError(error)) {
      throw error;
    }

    return {
      response: await generateJsonContent(client, input.fallbackModel, input.prompt, input.systemInstruction),
      usedModel: input.fallbackModel
    };
  }
}

function generateJsonContent(client: GoogleGenAI, model: string, prompt: string, systemInstruction: string) {
  return client.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      systemInstruction
    }
  });
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|quota|rate[- ]?limit|429/i.test(message);
}

export async function embedGeminiContent(input: EmbedGeminiContentInput): Promise<EmbedGeminiContentResult> {
  const env = getServerEnv();
  const config = validateAiConfig(env);
  const client = createGeminiClient();

  const response = await client.models.embedContent({
    model: config.embedding.model,
    contents: input.content,
    config: {
      taskType: input.taskType,
      title: input.title,
      outputDimensionality: config.embedding.dimension
    }
  });
  const values = response.embeddings?.[0]?.values;
  if (!values?.length) {
    throw new Error('Gemini returned no embedding.');
  }
  if (values.length !== config.embedding.dimension) {
    throw new Error('Gemini embedding dimension mismatch.');
  }

  return {
    values,
    provenance: {
      provider: 'gemini',
      model: config.embedding.model,
      dimension: config.embedding.dimension,
      taskType: input.taskType
    }
  };
}
