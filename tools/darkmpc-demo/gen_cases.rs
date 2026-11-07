// Copy into darkmpc/crates/reference/examples/ and run with --example gen_cases.
// Emit random Stage 1 batches and the reference fills (Passes::Fixed(3)) as JSON lines.
use darkmpc_reference::{match_batch, Order, Params, Passes};
struct Rng(u64);
impl Rng { fn next(&mut self) -> u64 { self.0 ^= self.0 << 13; self.0 ^= self.0 >> 7; self.0 ^= self.0 << 17; self.0 }
  fn below(&mut self, n: u64) -> u64 { self.next() % n } }
fn main() {
  let mut r = Rng(0x9e3779b97f4a7c15);
  for case in 0..5000 {
    let n = 1 + r.below(if case % 10 == 0 { 40 } else { 9 }) as usize;
    let syms = 1 + r.below(3) as u32;
    let big = case % 7 == 0;
    let orders: Vec<Order> = (0..n).map(|_| {
      let size = 1 + r.below(if big { 1u64 << 40 } else { 12 }).min((1u64 << 40) - 2);
      let min_fill = if r.below(3) == 0 { 1 } else { 1 + r.below(size) };
      let symbol = r.below(syms as u64) as u32;
      if r.below(2) == 0 { Order::buy(symbol, size, min_fill) } else { Order::sell(symbol, size, min_fill) }
    }).collect();
    let fills = match_batch(&orders, Params { passes: Passes::Fixed(3) }).unwrap();
    let os: Vec<String> = orders.iter().map(|o| format!("[{},{},\"{}\",\"{}\"]", o.symbol, if matches!(o.side, darkmpc_reference::Side::Buy) {0} else {1}, o.size, o.min_fill)).collect();
    let fs: Vec<String> = fills.iter().map(|f| format!("\"{}\"", f)).collect();
    println!("{{\"orders\":[{}],\"fills\":[{}]}}", os.join(","), fs.join(","));
  }
}
