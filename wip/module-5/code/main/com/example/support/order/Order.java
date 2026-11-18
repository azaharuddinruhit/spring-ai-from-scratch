package com.example.support.order;

import java.math.BigDecimal;
import java.time.LocalDate;

public record Order(String number, OrderStatus status, BigDecimal total, LocalDate placedOn, String trackingNumber) {
}
