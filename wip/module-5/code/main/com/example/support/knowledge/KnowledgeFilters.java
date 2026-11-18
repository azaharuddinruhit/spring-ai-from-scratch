package com.example.support.knowledge;

import org.springframework.ai.vectorstore.filter.Filter;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;

/** The metadata keys on every knowledge chunk, and the filters customer-facing searches must use. */
public final class KnowledgeFilters {

    public static final String SOURCE = "source";
    public static final String PRODUCT = "product";
    public static final String AUDIENCE = "audience";
    public static final String REVISION = "revision";

    private static final FilterExpressionBuilder FILTER = new FilterExpressionBuilder();

    private KnowledgeFilters() {
    }

    /** Every document a customer may read. */
    public static Filter.Expression customerDocuments() {
        return FILTER.eq(AUDIENCE, Audience.CUSTOMER.name()).build();
    }

    /** The customer documents about one product. Values are escaped, so user input can't change the filter. */
    public static Filter.Expression customerDocuments(String product) {
        return FILTER.and(FILTER.eq(AUDIENCE, Audience.CUSTOMER.name()), FILTER.eq(PRODUCT, product)).build();
    }
}
