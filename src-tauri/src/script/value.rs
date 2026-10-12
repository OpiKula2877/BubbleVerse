//! Script values are JSON values with Scratch-like conversions.

use std::cmp::Ordering;

use serde_json::{Number, Value};

pub fn num(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::Bool(b) => f64::from(u8::from(*b)),
        Value::String(s) => parse_num(s).unwrap_or(0.0),
        _ => 0.0,
    }
}

fn parse_num(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    match t.to_ascii_lowercase().as_str() {
        "infinity" => Some(f64::INFINITY),
        "-infinity" => Some(f64::NEG_INFINITY),
        "nan" => None,
        _ => t
            .replace(',', ".")
            .parse::<f64>()
            .ok()
            .filter(|_| !t.contains(' ')),
    }
}

pub fn text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => fmt_num(n.as_f64().unwrap_or(0.0)),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

pub fn fmt_num(x: f64) -> String {
    if x.is_nan() {
        "NaN".into()
    } else if x.is_infinite() {
        if x > 0.0 { "Infinity" } else { "-Infinity" }.into()
    } else if x.fract() == 0.0 && x.abs() < 1e15 {
        format!("{}", x as i64)
    } else {
        let s = format!("{x}");
        s
    }
}

pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|x| x != 0.0 && !x.is_nan()),
        Value::String(s) => {
            let t = s.trim();
            !(t.is_empty() || t == "0" || t.eq_ignore_ascii_case("false"))
        }
        Value::Null => false,
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

/// A number value; non-finite results become their text form (JSON cannot hold them).
pub fn from_num(x: f64) -> Value {
    if x.is_finite() {
        if x.fract() == 0.0 && x.abs() < 9.0e15 {
            Value::Number(Number::from(x as i64))
        } else {
            Number::from_f64(x).map_or(Value::Null, Value::Number)
        }
    } else {
        Value::String(fmt_num(x))
    }
}

fn as_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => parse_num(s),
        Value::Bool(_) => None,
        _ => None,
    }
}

/// Numeric comparison when both sides look like numbers, else case-insensitive text comparison.
pub fn compare(a: &Value, b: &Value) -> Ordering {
    match (as_number(a), as_number(b)) {
        (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(Ordering::Equal),
        _ => text(a).to_lowercase().cmp(&text(b).to_lowercase()),
    }
}

pub fn equals(a: &Value, b: &Value) -> bool {
    compare(a, b) == Ordering::Equal
}

/// 1-based list index from a script value; supports "last" and "random".
pub fn list_index(v: &Value, len: usize) -> Option<usize> {
    if let Value::String(s) = v {
        match s.trim().to_lowercase().as_str() {
            "last" => return len.checked_sub(1),
            "random" | "any" if len > 0 => return Some(rand::random::<usize>() % len),
            _ => {}
        }
    }
    let n = num(v).floor();
    if n >= 1.0 && (n as usize) <= len {
        Some(n as usize - 1)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn converts_like_scratch() {
        assert_eq!(num(&json!("12.5")), 12.5);
        assert_eq!(num(&json!(" 3,5 ")), 3.5);
        assert_eq!(num(&json!("abc")), 0.0);
        assert_eq!(num(&json!(true)), 1.0);
        assert_eq!(text(&json!(3.0)), "3");
        assert_eq!(text(&json!(0.5)), "0.5");
        assert_eq!(text(&json!(null)), "");
        assert!(!truthy(&json!("false")));
        assert!(!truthy(&json!("0")));
        assert!(truthy(&json!("no")));
        assert_eq!(from_num(f64::NAN), json!("NaN"));
        assert_eq!(from_num(4.0), json!(4));
    }

    #[test]
    fn compares_numbers_and_text() {
        assert_eq!(compare(&json!("10"), &json!(9)), Ordering::Greater);
        assert_eq!(compare(&json!("apple"), &json!("Banana")), Ordering::Less);
        assert!(equals(&json!("ABC"), &json!("abc")));
        assert!(equals(&json!("1.0"), &json!(1)));
        assert!(!equals(&json!(""), &json!(0)));
    }

    #[test]
    fn list_indexes() {
        assert_eq!(list_index(&json!(1), 3), Some(0));
        assert_eq!(list_index(&json!("last"), 3), Some(2));
        assert_eq!(list_index(&json!(4), 3), None);
        assert_eq!(list_index(&json!(0), 3), None);
    }
}
