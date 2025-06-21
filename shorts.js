// -----------------------------------------------------------
// shorts.js   ― 227 Shorts (single → array 版)
// -----------------------------------------------------------

const supabase = window.supabase.createClient(
  "https://hccairtzksnnqdujalgv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k"
);

const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

async function loadCard() {
  // 1件取得（配列で受ける）
  const { data, error } = await supabase
    .from("shorts_articles")
    .select("*")
    .eq("is_shown", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) { console.error("Supabase error:", error); return; }
  if (!data || !data.length) { console.log("未表示の記事なし"); return; }

  const art = data[0];

  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src        =
       art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;
  feed.append(node);

  // 閲覧済みに更新
  await supabase
    .from("shorts_articles")
    .update({ is_shown: true })
    .eq("id", art.id);
}

// 初期 3 枚
for (let i = 0; i < 3; i++) await loadCard();

// スクロールで追加
const io = new IntersectionObserver(async entries => {
  if (entries[0].isIntersecting) {
    await loadCard();
    io.observe(feed.lastElementChild);
  }
}, { threshold: 0.6 });

io.observe(feed.lastElementChild);
// -----------------------------------------------------------
// shorts.js   ― 227 Shorts 縦型スワイプビュー ロジック（fixed）
// -----------------------------------------------------------

// 1. Supabase 初期化 ----------------------------------------
const supabase = window.supabase.createClient(
  "https://hccairtzksnnqdujalgv.supabase.co",
  ""
);

// 2. DOM ----------------------------------------------------
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

// 3. 1 枚読んで描画 ----------------------------------------
async function loadCard() {
  /* 改修ポイント
     ① order('created_at', {ascending:false}) で最新順に 1 件
     ② .single() を使うと data がオブジェクトで返り扱いが楽
  */
  const { data: art, error } = await supabase
    .from("shorts_articles")
    .select("*")
    .eq("is_shown", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();           // ★

  if (error) { console.error("Supabase error:", error.message); return; }
  if (!art)   { console.log("未表示の記事なし"); return; }

  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src        =
       art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;
  feed.append(node);

  // 閲覧済みに更新
  await supabase.from("shorts_articles")
               .update({ is_shown: true })
               .eq("id", art.id);
}

// 4. 初期 3 枚 ---------------------------------------------
for (let i = 0; i < 3; i++) await loadCard();

// 5. IntersectionObserver -----------------------------------
const io = new IntersectionObserver(async entries => {
  if (entries[0].isIntersecting) {
    await loadCard();
    io.observe(feed.lastElementChild);
  }
}, { threshold: 0.6 });

io.observe(feed.lastElementChild);
