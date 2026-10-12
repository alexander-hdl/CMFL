// Ревью этапа 2: проверки, добавленные ревьюером. Как и прежние файлы, общаются с игрой только через window.OT и DOM-id.

const run = (page, fn, arg) => page.evaluate(fn, arg);

export function register({ test, assert, eq }) {

  test("Ревью 2: план Solver и призрак подсказки режут босса по общему множителю (7 × 8 → 7 × 5 + 7 × 3, 4 × 23 → 4 × 20 + 4 × 3)", async ({ page }) => {
    const bad = await run(page, () => {
      const out = [], lands = OT.lands();
      for (const [land, cards] of [[4, lands[3].boss], [6, lands[5].boss]]) for (const card of cards) {
        const c = card.split(":")[1].split("x").map(Number), a = Math.min(...c), n = c[0] * c[1], parts = OT.split(card) || [n];
        for (const idx of [0, 1, 2, 4]) {                       // T1, T2, T3, T4
          OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(land, idx);
          OT.setWave([n], { armored: [n], cards: { [n]: card } });
          const s = OT.state(), want = a + " × " + parts[0] / a;
          if (!s.hints.length || s.hints[0].ghost !== want) out.push(`${card} ${s.template}: призрак ${s.hints[0] && s.hints[0].ghost}, ждали ${want}`);
          for (const p of s.wave.plan) if (p.da !== a && p.db !== a) out.push(`${card} ${s.template}: часть ${p.n} строится как ${p.da} × ${p.db}`);
        }
      }
      return out;
    });
    eq(bad, [], "разрезание в плане и подсказке");
    // В сгенерированных волнах земель 4 и 6 разложение иногда уступает соседним числам (общие башни), но в основном держится.
    const r = await run(page, () => {
      let ok = 0, all = 0;
      for (const land of [4, 6]) for (let idx = 0; idx < 5; idx++) for (let w = 0; w < 3; w++) for (let seed = 1; seed <= 4; seed++) {
        for (const h of OT.waveFor(land, idx, w, seed * 31 + 7).hints) {
          const c = h.card.split(":")[1].split("x").map(Number), a = Math.min(...c);
          all++; if (h.ghost === a + " × " + h.parts[0] / a) ok++;
        }
      }
      return { ok, all };
    });
    assert(r.all > 50 && r.ok / r.all >= 0.75, `призрак по общему множителю в ${r.ok} из ${r.all} волн`);
  });

  test("Ревью 2: босс 4 × 23 = 92 на земле 6 — лучи 4 × 20 и 4 × 3 по плану, «92 − 80 = 12», затем победа", async ({ page }) => {
    const r = await run(page, () => {
      OT.manual(true); OT.seed(1); OT.newGame({ veteran: true }); OT.loadLevel(6, 0);
      OT.setWave([92], { armored: [92], cards: { 92: "m:4x23" } });
      const plan = OT.state().wave.plan;
      for (const p of plan) { OT.placeTower(p.a, p.da); OT.placeTower(p.b, p.db); }
      for (const p of plan) OT.link(p.a, p.b);
      OT.events({ clear: true }); OT.startWave();
      let note = null;
      for (let i = 0; i < 600 && !note; i++) { OT.step(0.1); note = OT.drawn().notes.map((n) => n.text).find((t) => t.includes("−")) || null; }
      const st = OT.runWave(), ev = OT.events();
      return { labels: OT.state().beams.map((b) => b.label).sort(), note, hits: ev.filter((e) => e.type === "boss_hit").map((e) => [e.from, e.product, e.to]),
        killed: ev.filter((e) => e.type === "enemy_killed").length, hearts: st.hearts };
    });
    eq(r.labels, ["4 × 20 = 80", "4 × 3 = 12"], "лучи по разрядам");
    eq(r.note, "92 − 80 = 12", "запись над боссом");
    eq([r.hits, r.killed, r.hearts], [[[92, 80, 12]], 1, 10], "удар и победа");
  });
}
