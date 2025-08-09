document.addEventListener('DOMContentLoaded', () => {
  // Supabaseクライアントの初期化
  const { createClient } = window.supabase;
  const db = createClient(
    'https://hccairtzksnnqdujalgv.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
  );

  // HTML要素を取得
  const emailEl = document.getElementById('account-email');
  const rankIconEl = document.getElementById('rank-icon');
  const rankNameEl = document.getElementById('rank-name');
  const expBarEl = document.getElementById('exp-progress-bar');
  const expValueEl = document.getElementById('exp-value');
  const logoutBtn = document.getElementById('account-logout-btn');

  // ランクの定義
  const ranks = {
    'ブロンズ': { icon: '🥉', nextExp: 100, baseExp: 0 },
    'シルバー': { icon: '🥈', nextExp: 300, baseExp: 100 },
    'ゴールド': { icon: '🥇', nextExp: 600, baseExp: 300 },
    'プラチナ': { icon: '💎', nextExp: 1000, baseExp: 600 },
    'ダイアモンド': { icon: '🏆', nextExp: null, baseExp: 1000 }
  };

  /**
   * アカウント情報を読み込んでページに表示する関数
   */
  async function loadAccountInfo() {
    // ユーザーセッションを取得
    const { data: { session }, error: sessionError } = await db.auth.getSession();

    if (sessionError || !session) {
      console.error('セッションの取得に失敗しました。');
      // ログインページにリダイレクト
      window.location.href = 'index.html?redirect=login-required';
      return;
    }

    const user = session.user;
    
    // usersテーブルからランクとEXPを取得
    const { data: userData, error: userError } = await db.from('users')
      .select('rank, exp')
      .eq('supabase_uid', user.id)
      .single();

    if (userError) {
      console.error('ユーザー情報の取得に失敗:', userError);
      alert('ユーザー情報の取得に失敗しました。');
      return;
    }
    
    // --- 取得したデータでHTMLを更新 ---

    // 1. メールアドレスを表示
    emailEl.textContent = user.email;

    // 2. ランク情報を取得
    const currentRank = userData.rank || 'ブロンズ';
    const currentExp = userData.exp || 0;
    const rankInfo = ranks[currentRank];

    // 3. ランク名とアイコンを表示
    rankNameEl.textContent = currentRank;
    rankIconEl.textContent = rankInfo.icon;

    // 4. EXPとプログレスバーを計算して表示
    if (rankInfo.nextExp) { // ダイアモンドランク以外の場合
      const expInCurrentRank = currentExp - rankInfo.baseExp;
      const expForNextRank = rankInfo.nextExp - rankInfo.baseExp;
      const progressPercentage = Math.floor((expInCurrentRank / expForNextRank) * 100);
      
      expValueEl.textContent = `${currentExp} / ${rankInfo.nextExp} EXP`;
      expBarEl.style.width = `${progressPercentage}%`;
    } else { // ダイアモンドランクの場合
      expValueEl.textContent = `${currentExp} EXP`;
      expBarEl.style.width = '100%';
      expBarEl.style.backgroundColor = 'var(--color-primary)'; // 最大ランクは色を変えるなど
    }
  }

  // ログアウト処理
  logoutBtn.addEventListener('click', async () => {
    if (confirm('ログアウトしますか？')) {
      const { error } = await db.auth.signOut();
      if (error) {
        alert('ログアウトに失敗しました。');
      } else {
        window.location.href = 'index.html';
      }
    }
  });

  // ページの読み込みが完了したらアカウント情報を読み込む
  loadAccountInfo();
});
