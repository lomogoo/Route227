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
  // is_shown が false の記事を、作成日が新しい順に1件だけ取得
  const { data: art, error } = await supabase
    .from("shorts_articles")
    .select("*")
    .eq("is_shown", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single(); // .single() を使うと、結果が配列ではなくオブジェクトで返るため扱いやすいです

  // データ取得でエラーが発生したか、対象の記事がもう無ければ処理を終了
  if (error) {
    console.error("Supabaseからのデータ取得中にエラーが発生しました:", error.message);
    return;
  }
  if (!art) {
    console.log("表示できる新しい記事がありません。");
    // ここで「これ以上記事はありません」といったメッセージを画面に表示することもできます
    return;
  }

  // <template> タグからカードのHTML構造をコピー
  const node = tpl.content.cloneNode(true);

  // コピーしたHTMLに、取得した記事のデータを埋め込む
  node.querySelector("img").src        = art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href         = art.article_url;

  // 画面の <div id="feed"> に作成したカードを追加
  feed.append(node);

  // この記事を「表示済み」としてデータベースを更新
  await supabase
    .from("shorts_articles")
    .update({ is_shown: true })
    .eq("id", art.id);
}

// 4. 初期表示として、まず3枚のカードを読み込む
async function initializeFeed() {
    // feedが空の場合のみ最初のカードを読み込む
    if (feed.children.length === 0) {
        await loadCard();
    }
    // IntersectionObserverのセットアップ
    setupIntersectionObserver();
}


// 5. 無限スクロール（縦スワイプ）を実現する仕組み
function setupIntersectionObserver() {
    if (!feed.lastElementChild) {
        return; // 表示するカードがなければ何もしない
    }
    const io = new IntersectionObserver(async (entries, observer) => {
        // 監視している要素（最後のカード）が画面に60%以上表示されたら
        if (entries[0].isIntersecting) {
            // 次のカードを読み込む前に、現在の監視を一旦停止
            observer.unobserve(entries[0].target);
            
            // 新しいカードを読み込む
            await loadCard();

            // 新しく追加されたカード（新しい最後のカード）を監視対象に設定
            if (feed.lastElementChild) {
                observer.observe(feed.lastElementChild);
            }
        }
    }, { threshold: 0.6 }); // 60%画面に入ったら発動

    // 最後のカードを監視対象として設定
    io.observe(feed.lastElementChild);
}

// 最初にフィードを初期化
initializeFeed();
