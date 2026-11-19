CREATE TABLE IF NOT EXISTS orders (
    number          VARCHAR(20)    PRIMARY KEY,
    customer_id     VARCHAR(100)   NOT NULL,
    status          VARCHAR(20)    NOT NULL,
    total           NUMERIC(12, 2) NOT NULL,
    placed_on       DATE           NOT NULL,
    tracking_number VARCHAR(40)
);
DELETE FROM orders;
INSERT INTO orders VALUES
    ('1042', 'alice', 'SHIPPED', 59.90, DATE '2026-11-02', '1Z999AA10123456784'),
    ('2077', 'bob', 'PROCESSING', 120.00, DATE '2026-11-10', NULL);
