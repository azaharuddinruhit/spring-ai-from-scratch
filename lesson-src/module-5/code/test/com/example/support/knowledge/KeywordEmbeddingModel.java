package com.example.support.knowledge;

import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;

import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingRequest;
import org.springframework.ai.embedding.EmbeddingResponse;

/** A deterministic stand-in for a real embedding model: texts that share words get similar vectors. */
class KeywordEmbeddingModel implements EmbeddingModel {

    private static final int DIMENSIONS = 256;

    @Override
    public EmbeddingResponse call(EmbeddingRequest request) {
        List<String> texts = request.getInstructions();
        return new EmbeddingResponse(IntStream.range(0, texts.size())
                .mapToObj(i -> new Embedding(embed(texts.get(i)), i))
                .toList());
    }

    @Override
    public float[] embed(Document document) {
        return embed(document.getText());
    }

    @Override
    public float[] embed(String text) {
        float[] vector = new float[DIMENSIONS];
        for (String word : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (word.length() > 2) {
                vector[Math.floorMod(stem(word).hashCode(), DIMENSIONS)] += 1;
            }
        }
        return vector;
    }

    private static String stem(String word) {
        return word.endsWith("s") ? word.substring(0, word.length() - 1) : word;
    }
}
