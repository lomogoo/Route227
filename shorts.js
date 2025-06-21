// ===== [デバッグ版] shorts.js =====

console.log('✅ [Debug] shorts.js スクリプトの読み込み開始');

// 1. Supabase クライアントの初期化
const { createClient } = window.supabase;
const supabase = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);
console.log('✅ [Debug] Supabaseクライアント初期化完了');

// 2. 必要なHTML要素を取得
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");
console.log('✅ [Debug] HTML要素取得:', { feed, tpl });

// 3. 記事を1件読み込んで画面に表示する関数
async function loadCard() {
  console.log('🔄 [Debug] loadCard: カード読み込み処理を開始します');

  const { data: art, error } = await supabase
    .from("shorts_articles")
    .select("*")
    .eq("is_shown", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  console.log('🚚 [Debug] Supabaseからの応答:', { art, error });

  if (error) {
    console.error('❌ [Debug] Supabaseエラーが発生しました:', error.message);
    return;
  }
  if (!art) {
    console.log('ℹ️ [Debug] 表示できる新しい記事がありませんでした。処理を終了します。');
    return;
  }

  console.log('📄 [Debug] 記事データを使ってHTMLを生成します:', art.title);
  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src        = art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;

  console.log('➡️ [Debug] feed要素に新しいカードを追加します');
  feed.append(node);
  console.log('✅ [Debug] カードの画面への追加が完了しました');

  console.log('🔄 [Debug] 表示済みフラグを更新します. ID:', art.id);
  await supabase
    .from("shorts_articles")
    .update({ is_shown: true })
    .eq("id", art.id);
  console.log('✅ [Debug] 表示済みフラグの更新完了');
}

// 4. 初期表示のロジック
async function initializeFeed() {
    console.log('🚀 [Debug] initializeFeed: 初期化処理を開始します');
    await loadCard();
    console.log('👀 [Debug] IntersectionObserverのセットアップを開始します');
    setupIntersectionObserver();
}

// 5. 無限スクロールの仕組み
function setupIntersectionObserver() {
    if (!feed.lastElementChild) {
        console.warn('⚠️ [Debug] 監視対象のカードが見つからないため、スクロール監視を開始できません。');
        return;
    }
    
    const io = new IntersectionObserver(async (entries, observer) => {
        if (entries[0].isIntersecting) {
            console.log('👁️ [Debug] スクロールを検知！次のカードを読み込みます。');
            observer.unobserve(entries[0].target);
            await loadCard();
            if (feed.lastElementChild) {
                observer.observe(feed.lastElementChild);
            }
        }
    }, { threshold: 0.6 });

    console.log('🔍 [Debug] 最後のカードの監視を開始します:', feed.lastElementChild);
    io.observe(feed.lastElementChild);
}

// 最初にフィードを初期化
initializeFeed();
