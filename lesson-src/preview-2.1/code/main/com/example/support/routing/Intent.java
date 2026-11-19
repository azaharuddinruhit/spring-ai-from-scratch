package com.example.support.routing;

/** What a customer's message asks for. Each constant is one option of the intent question; the description helps the model. */
public enum Intent {

    REFUND("refund", "The customer wants money back for an order or an item"),
    ORDER_STATUS("order_status", "The customer asks where an order is or when it arrives"),
    ADDRESS_CHANGE("address_change", "The customer wants an order delivered somewhere else"),
    COMPLAINT("complaint", "The customer complains about the service, a delivery or a product"),
    OTHER("other", "Anything else, such as a product question or a thank-you");

    private final String option;
    private final String description;

    Intent(String option, String description) {
        this.option = option;
        this.description = description;
    }

    public String option() {
        return option;
    }

    public String description() {
        return description;
    }

    public static Intent fromOption(String option) {
        for (Intent intent : values()) {
            if (intent.option.equals(option)) {
                return intent;
            }
        }
        throw new IllegalArgumentException("Unknown intent option: " + option);
    }
}
