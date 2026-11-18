package com.example.support.knowledge;

import static com.example.support.knowledge.KnowledgeFilters.AUDIENCE;
import static com.example.support.knowledge.KnowledgeFilters.PRODUCT;
import static com.example.support.knowledge.KnowledgeFilters.REVISION;
import static com.example.support.knowledge.KnowledgeFilters.SOURCE;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.ai.document.Document;
import org.springframework.ai.document.DocumentReader;
import org.springframework.ai.reader.ExtractedTextFormatter;
import org.springframework.ai.reader.markdown.MarkdownDocumentReader;
import org.springframework.ai.reader.markdown.config.MarkdownDocumentReaderConfig;
import org.springframework.ai.reader.pdf.PagePdfDocumentReader;
import org.springframework.ai.reader.pdf.config.PdfDocumentReaderConfig;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class KnowledgeIngestionService {

    private static final PdfDocumentReaderConfig PDF = PdfDocumentReaderConfig.builder()
            .withPageExtractedTextFormatter(ExtractedTextFormatter.builder()
                    .withLeftAlignment(true)
                    .withNumberOfTopTextLinesToDelete(1)    // the running header
                    .withNumberOfBottomTextLinesToDelete(2) // the page footer and the blank line after it
                    .overrideLineSeparator("\n")            // PDFBox always uses \n, on Windows too
                    .build())
            .build();

    private static final MarkdownDocumentReaderConfig MARKDOWN = MarkdownDocumentReaderConfig.builder()
            .withIncludeCodeBlock(true) // keep code with the text that explains it
            .build();

    private final TokenTextSplitter splitter = TokenTextSplitter.builder()
            .withChunkSize(400)
            .withMinChunkSizeChars(200)
            .build();

    private final VectorStore vectorStore;

    public KnowledgeIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    /** Reads, splits and stores one file, replacing the chunks of its previous version. Returns the chunk count. */
    public int ingest(Resource file, String product, Audience audience) {
        String source = file.getFilename();
        String revision = UUID.randomUUID().toString();

        List<Document> chunks = splitter.split(readerFor(file).read());
        chunks.forEach(chunk -> chunk.getMetadata().putAll(Map.of(
                SOURCE, source,
                PRODUCT, product,
                AUDIENCE, audience.name(),
                REVISION, revision)));
        vectorStore.add(chunks);

        // Only after the new chunks are stored: if embedding fails, the old version stays searchable.
        var filter = new FilterExpressionBuilder();
        vectorStore.delete(filter.and(filter.eq(SOURCE, source), filter.ne(REVISION, revision)).build());
        return chunks.size();
    }

    private static DocumentReader readerFor(Resource file) {
        return switch (StringUtils.getFilenameExtension(file.getFilename())) {
            case "pdf" -> new PagePdfDocumentReader(file, PDF);
            case "md" -> new MarkdownDocumentReader(file, MARKDOWN);
            case null, default -> throw new IllegalArgumentException("Unsupported knowledge file: " + file.getFilename());
        };
    }
}
