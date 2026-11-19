CREATE TABLE IF NOT EXISTS orders (
    number          VARCHAR(20)    PRIMARY KEY,
    customer_id     VARCHAR(100)   NOT NULL,
    status          VARCHAR(20)    NOT NULL,
    total           NUMERIC(12, 2) NOT NULL,
    placed_on       DATE           NOT NULL,
    tracking_number VARCHAR(40)
);
CREATE TABLE IF NOT EXISTS refunds (
    id           UUID           PRIMARY KEY,
    customer_id  VARCHAR(100)   NOT NULL,
    order_number VARCHAR(20)    NOT NULL REFERENCES orders (number),
    amount       NUMERIC(12, 2) NOT NULL,
    reason       VARCHAR(500)   NOT NULL,
    status       VARCHAR(20)    NOT NULL,
    expires_at   TIMESTAMPTZ    NOT NULL
);
DELETE FROM refunds;
DELETE FROM orders;
INSERT INTO orders VALUES
    ('1042', 'alice', 'SHIPPED', 59.90, DATE '2026-11-02', '1Z999AA10123456784'),
    ('2077', 'bob', 'PROCESSING', 120.00, DATE '2026-11-10', NULL);
