use chrono::{Datelike, Local, TimeZone, Timelike};
use rand::Rng;
use serde_json::Value;

use super::unsupported;
use crate::script::exec::{Ctx, R};
use crate::script::format::Node;
use crate::script::generated::opcodes::{arg, Op};
use crate::script::value::{compare, equals, from_num, num, text};

pub async fn eval(ctx: &mut Ctx, node: &Node) -> R<Value> {
    use std::cmp::Ordering::*;
    let op = node.op;
    match op {
        Op::OpAdd | Op::OpSub | Op::OpMul | Op::OpDiv | Op::OpMod => {
            let a = ctx.num(node, 0).await?;
            let b = ctx.num(node, 1).await?;
            Ok(from_num(match op {
                Op::OpAdd => a + b,
                Op::OpSub => a - b,
                Op::OpMul => a * b,
                Op::OpDiv => a / b,
                // Result has the sign of the divisor, like Scratch.
                _ => a - b * (a / b).floor(),
            }))
        }
        Op::OpRound => Ok(from_num(ctx.num(node, 0).await?.round())),
        Op::OpMath => {
            use arg::op_math::*;
            let f = node.lit_str(FN);
            let a = ctx.num(node, A).await?;
            let r = a.to_radians();
            Ok(from_num(match f.as_str() {
                "abs" => a.abs(),
                "floor" => a.floor(),
                "ceil" => a.ceil(),
                "sqrt" => a.sqrt(),
                "sin" => round_trig(r.sin()),
                "cos" => round_trig(r.cos()),
                "tan" => round_trig(r.tan()),
                "asin" => a.asin().to_degrees(),
                "acos" => a.acos().to_degrees(),
                "atan" => a.atan().to_degrees(),
                "ln" => a.ln(),
                "log" => a.log10(),
                "exp" => a.exp(),
                "pow10" => 10f64.powf(a),
                _ => a,
            }))
        }
        Op::OpRandom => {
            let a = ctx.eval(node, 0).await?;
            let b = ctx.eval(node, 1).await?;
            let (x, y) = (num(&a), num(&b));
            let (lo, hi) = if x <= y { (x, y) } else { (y, x) };
            let ints = lo.fract() == 0.0
                && hi.fract() == 0.0
                && !text(&a).contains('.')
                && !text(&b).contains('.');
            let mut rng = rand::thread_rng();
            Ok(if ints {
                from_num(rng.gen_range(lo as i64..=hi as i64) as f64)
            } else if hi > lo {
                from_num(rng.gen_range(lo..hi))
            } else {
                from_num(lo)
            })
        }
        Op::OpLt | Op::OpEq | Op::OpGt | Op::OpLe | Op::OpGe | Op::OpNe => {
            let a = ctx.eval(node, 0).await?;
            let b = ctx.eval(node, 1).await?;
            let c = compare(&a, &b);
            Ok(Value::Bool(match op {
                Op::OpLt => c == Less,
                Op::OpEq => equals(&a, &b),
                Op::OpGt => c == Greater,
                Op::OpLe => c != Greater,
                Op::OpGe => c != Less,
                _ => !equals(&a, &b),
            }))
        }
        Op::OpAnd => {
            let a = ctx.truthy(node, 0).await?;
            Ok(Value::Bool(a && ctx.truthy(node, 1).await?))
        }
        Op::OpOr => {
            let a = ctx.truthy(node, 0).await?;
            Ok(Value::Bool(a || ctx.truthy(node, 1).await?))
        }
        Op::OpNot => Ok(Value::Bool(!ctx.truthy(node, 0).await?)),
        Op::OpJoin => {
            let a = ctx.text(node, 0).await?;
            let b = ctx.text(node, 1).await?;
            Ok(Value::String(a + &b))
        }
        Op::OpLetter => {
            let n = ctx.num(node, 0).await?;
            let s = ctx.text(node, 1).await?;
            let i = n.floor() as i64;
            Ok(Value::String(if i >= 1 {
                s.chars()
                    .nth(i as usize - 1)
                    .map(String::from)
                    .unwrap_or_default()
            } else {
                String::new()
            }))
        }
        Op::OpLength => Ok(from_num(ctx.text(node, 0).await?.chars().count() as f64)),
        Op::OpContains => {
            let s = ctx.text(node, 0).await?.to_lowercase();
            let t = ctx.text(node, 1).await?.to_lowercase();
            Ok(Value::Bool(s.contains(&t)))
        }
        Op::OpReplace => {
            use arg::op_replace::*;
            let a = ctx.text(node, A).await?;
            let b = ctx.text(node, B).await?;
            let s = ctx.text(node, S).await?;
            Ok(Value::String(if a.is_empty() {
                s
            } else {
                s.replace(&a, &b)
            }))
        }
        Op::OpSplit => {
            let s = ctx.text(node, 0).await?;
            let sep = ctx.text(node, 1).await?;
            let parts: Vec<Value> = if sep.is_empty() {
                s.chars().map(|c| Value::String(c.to_string())).collect()
            } else {
                s.split(sep.as_str())
                    .map(|p| Value::String(p.to_string()))
                    .collect()
            };
            Ok(Value::Array(parts))
        }
        Op::OpCase => {
            use arg::op_case::*;
            let s = ctx.text(node, S).await?;
            Ok(Value::String(if node.lit_str(CASE) == "upper" {
                s.to_uppercase()
            } else {
                s.to_lowercase()
            }))
        }
        Op::OpTrim => Ok(Value::String(ctx.text(node, 0).await?.trim().to_string())),
        Op::OpRegex => {
            let s = ctx.text(node, 0).await?;
            let pattern = ctx.text(node, 1).await?;
            let re = regex::Regex::new(&pattern)
                .map_err(|e| ctx.err(node, format!("invalid regular expression: {e}")))?;
            Ok(Value::Bool(re.is_match(&s)))
        }
        Op::OpToNumber => Ok(from_num(num(&ctx.eval(node, 0).await?))),
        Op::OpToText => Ok(Value::String(text(&ctx.eval(node, 0).await?))),
        Op::OpFormatDate => {
            use arg::op_format_date::*;
            let ts = ctx.num(node, TS).await?;
            let fmt = ctx.text(node, FMT).await?;
            Ok(Value::String(format_date(ts, &fmt)))
        }
        _ => Err(unsupported(ctx, node)),
    }
}

/// sin(180°) should be 0, not 1.2e-16.
fn round_trig(x: f64) -> f64 {
    (x * 1e10).round() / 1e10
}

/// Formats a Unix timestamp (seconds; 0 = now) in local time.
/// Tokens: YYYY YY MM M DD D HH H mm m ss s.
pub fn format_date(ts: f64, fmt: &str) -> String {
    let dt = if ts == 0.0 {
        Local::now()
    } else {
        match Local.timestamp_millis_opt((ts * 1000.0) as i64) {
            chrono::LocalResult::Single(d) => d,
            _ => Local::now(),
        }
    };
    let tokens: [(&str, String); 12] = [
        ("YYYY", format!("{:04}", dt.year())),
        ("YY", format!("{:02}", dt.year() % 100)),
        ("MM", format!("{:02}", dt.month())),
        ("M", dt.month().to_string()),
        ("DD", format!("{:02}", dt.day())),
        ("D", dt.day().to_string()),
        ("HH", format!("{:02}", dt.hour())),
        ("H", dt.hour().to_string()),
        ("mm", format!("{:02}", dt.minute())),
        ("m", dt.minute().to_string()),
        ("ss", format!("{:02}", dt.second())),
        ("s", dt.second().to_string()),
    ];
    let mut out = String::new();
    let mut rest = fmt;
    'outer: while !rest.is_empty() {
        for (tok, val) in &tokens {
            if let Some(r) = rest.strip_prefix(tok) {
                out.push_str(val);
                rest = r;
                continue 'outer;
            }
        }
        let mut chars = rest.chars();
        if let Some(c) = chars.next() {
            out.push(c);
        }
        rest = chars.as_str();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_dates() {
        let ts = Local
            .with_ymd_and_hms(2026, 3, 7, 9, 5, 4)
            .single()
            .unwrap()
            .timestamp() as f64;
        assert_eq!(
            format_date(ts, "YYYY-MM-DD HH:mm:ss"),
            "2026-03-07 09:05:04"
        );
        assert_eq!(format_date(ts, "D.M.YY H:m"), "7.3.26 9:5");
    }
}
