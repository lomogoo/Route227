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

// --- スクロールをピタッと止めるための追加ロジック ---

// スクロールするコンテナ要素を取得
const scrollContainer = document.getElementById('feed');
// タイマーを管理するための変数を準備
let scrollTimer = null;

// コンテナがスクロールされるたびに、以下の処理を実行
scrollContainer.addEventListener('scroll', () => {
  // もしタイマーが既にセットされていたら、一度リセットする
  // (スクロールが続いている間は、補正処理が動かないようにするため)
  clearTimeout(scrollTimer);

  // スクロールが止まったら実行されるタイマーを新たにセット
  scrollTimer = setTimeout(() => {
    // 1カード分の高さ（コンテナ自身の高さ）を取得
    const containerHeight = scrollContainer.offsetHeight;
    
    // 現在のスクロール位置から、最も近いカードの番号（インデックス）を計算
    const targetIndex = Math.round(scrollContainer.scrollTop / containerHeight);
    
    // そのカードが表示されるべき、本来のスクロール位置を計算
    const targetScrollTop = targetIndex * containerHeight;

    // 計算した「あるべき位置」へ、スムーズにスクロールさせてズレを補正する
    scrollContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
    
  }, 100); // 100ミリ秒(0.1秒)間スクロールがなければ「止まった」とみなす
});

// 最初にフィードを初期化
initializeFeed();
