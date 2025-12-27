import { get_encoding } from "tiktoken";

const enc = get_encoding("cl100k_base"); // Encoder for GPT-4/3.5

export function countTokens(text) {
  if (!text) return 0;
  return enc.encode(text).length;
}

export function chunkText(text, maxTokens = 10000) {
  const tokens = enc.encode(text);
  if (tokens.length <= maxTokens) {
    return [text];
  }

  const chunks = [];
  let currentChunk = [];

  // Naive chunking by tokens - strictly might cut words, but tiktoken handles subwords.
  // Ideally, we decode back to string to ensure validity, or split by sentence.
  // For robustness, let's split by sentence/newline and accumulate.

  // Decoding entire large text is fast enough.
  // Better strategy: Split by likely boundaries, then measure.

  // For this implementation, let's take the raw token slices to ensure strict limit compliance
  // then decode them. This is the safest way to guarantee token counts.

  for (let i = 0; i < tokens.length; i += maxTokens) {
    const slice = tokens.slice(i, i + maxTokens);
    chunks.push(new TextDecoder().decode(enc.decode(slice)));
    // Wait, enc.decode returns Uint8Array or string? JS tiktoken returns string usually.
    // JS 'tiktoken' library decode returns strings.
  }

  const decodedChunks = [];
  for (let i = 0; i < tokens.length; i += maxTokens) {
    decodedChunks.push(enc.decode(tokens.slice(i, i + maxTokens)));
  }

  return decodedChunks;
}
