// -----------------------------------------------------------
// shorts.js   ―― 227 Shorts 縦型スワイプビュー ロジック
//   - Supabase から未表示記事 (is_shown=false) をランダム取得
//   - 1 スワイプ 1 記事で無限ロード
// -----------------------------------------------------------

// 1. Supabase 初期化 ----------------------------------------
const supabase = window.supabase.createClient(
  "https://hccairtzksnnqdujalgv.supabase.co",   // ← プロジェクト URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k"                 // ← anon public key
);

// 2. DOM 要素 ------------------------------------------------
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

// 3. 記事 1 件ロード ----------------------------------------
async function loadCard() {
  // is_shown=false からランダム取得
  const { data, error } = await supabase
    .from("shorts_articles")
    .select("*")
    .eq("is_shown", false)
    .order("random()")
    .limit(1);

  if (error) {
    console.error("Supabase error:", error.message);
    return;
  }
  if (!data.length) {
    console.log("未表示の記事がありません");
    return;
  }

  const art = data[0];

  // テンプレ複製して内容を挿入
  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src        =
       art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;

  feed.append(node);

  // 閲覧済みフラグを立てる（重複防止）
  await supabase
    .from("shorts_articles")
    .update({ is_shown: true })
    .eq("id", art.id);
}

// 4. 初期表示：最初に 3 枚ロード -----------------------------
for (let i = 0; i < 3; i++) await loadCard();

// 5. IntersectionObserver で末尾を監視 -----------------------
const io = new IntersectionObserver(async entries => {
  const last = entries[0];
  if (last.isIntersecting) {
    await loadCard();
    // 末尾が更新されたので新しい末尾を再監視
    io.observe(feed.lastElementChild);
  }
}, { threshold: 0.6 });

// 最初の末尾カードを監視開始
io.observe(feed.lastElementChild);
