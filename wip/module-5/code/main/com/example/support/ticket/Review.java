package com.example.support.ticket;

import java.util.List;

public record Review(boolean approved, List<String> problems) {
}
