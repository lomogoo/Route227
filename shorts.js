// 1. Supabase クライアントの初期化
const { createClient } = window.supabase;
const supabase = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

// 2. 必要なHTML要素を取得
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

// 3. 記事を1件読み込んで画面に表示する関数
async function loadCard() {
  // ★★★ 変更点 ★★★
  // 'random_shorts_articles'というVIEWから、ランダムに1件取得する
  const { data: art, error } = await supabase
    .from("random_shorts_articles") // テーブル名がVIEW名に変わりました
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("Supabaseからのデータ取得中にエラーが発生しました:", error.message);
    return;
  }
  if (!art) {
    console.log("表示できる記事がありません。");
    return;
  }

  // <template> タグからカードのHTML構造をコピーしてデータを埋め込む
  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src        = art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;
  feed.append(node);

  // ★★★ 変更点 ★★★
  // 「表示済みに更新する」処理は、まるごと不要になったので削除しました。
}

// 4. 初期表示として、まず3枚のカードを読み込む
async function initializeFeed() {
    for (let i = 0; i < 3; i++) {
        await loadCard();
    }
    setupIntersectionObserver();
}

// 5. 無限スクロールの仕組み
function setupIntersectionObserver() {
    if (!feed.lastElementChild) {
        return; 
    }
    const io = new IntersectionObserver(async (entries, observer) => {
        if (entries[0].isIntersecting) {
            observer.unobserve(entries[0].target);
            await loadCard();
            if (feed.lastElementChild) {
                observer.observe(feed.lastElementChild);
            }
        }
    }, { threshold: 0.6 });

    io.observe(feed.lastElementChild);
}

// 最初にフィードを初期化
initializeFeed();
