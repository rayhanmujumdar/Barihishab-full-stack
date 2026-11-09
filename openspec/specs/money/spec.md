# money Specification

## Purpose

Turns what people type into exact integer paisa and shows paisa back as taka in Bangla or English with lakh grouping, so no amount anywhere is ever a float. (Income & Expenses PRD §3.8, §8)

## Requirements

### Requirement: Amount parsing to integer paisa
The system SHALL parse a typed amount into integer paisa by stripping `৳`, spaces and commas, converting Bangla digits `০–৯` to `0–9`, allowing at most two decimal places, and converting with integer arithmetic only. Input that is empty, non-numeric, negative, or has more than two decimals MUST be rejected. Amounts MUST be greater than 0 and at most 1,000,000,000 paisa (৳1 crore).

#### Scenario: Bangla digits with paisa
- **WHEN** the input is `"৳১৮,০০০.৫০"`
- **THEN** the result is 1800050 paisa (IE-02)

#### Scenario: English with grouping
- **WHEN** the input is `"6,300"`
- **THEN** the result is 630000 paisa

#### Scenario: One decimal digit
- **WHEN** the input is `"0.5"`
- **THEN** the result is 50 paisa

#### Scenario: Invalid input
- **WHEN** the input is `"0"`, `"-5"`, `"12.345"`, `"abc"` or `"10000000.01"`
- **THEN** parsing fails

### Requirement: Bilingual money display
The system SHALL format paisa as taka with the `৳` sign and lakh grouping (last three digits, then groups of two), using Bangla digits in Bangla and ASCII digits in English. Decimals MUST be shown only when the paisa part is not zero (always two digits then). Negative values MUST show a leading minus.

#### Scenario: English lakh grouping
- **WHEN** 14500000 paisa is formatted in English
- **THEN** the text is `৳1,45,000`

#### Scenario: Bangla digits
- **WHEN** 14500000 paisa is formatted in Bangla
- **THEN** the text is `৳১,৪৫,০০০`

#### Scenario: Paisa shown only when non-zero
- **WHEN** 630050 paisa is formatted in English
- **THEN** the text is `৳6,300.50`

#### Scenario: Negative balance
- **WHEN** -230000 paisa is formatted in English
- **THEN** the text is `−৳2,300`
