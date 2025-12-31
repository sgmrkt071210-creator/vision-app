import React, { useState, useEffect, useMemo } from 'react';
import { Plus, CheckCircle2, Circle, Trash2, Tag, Trophy, Repeat, Heart, Loader2, Search, ChevronDown, ChevronUp, CalendarDays, ListTodo, Lightbulb, MessageSquare, X, Gift, Sparkles, BookOpen, RefreshCcw, AlertCircle, TrendingUp, Flag } from 'lucide-react';

// カテゴリー定義
const CATEGORIES = {
  CHALLENGE: { id: 'CHALLENGE', label: 'チャレンジ系', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Trophy },
  HABIT: { id: 'HABIT', label: '習慣系', color: 'bg-green-100 text-green-800 border-green-200', icon: Repeat },
  HOBBY: { id: 'HOBBY', label: '趣味系', color: 'bg-lime-100 text-lime-800 border-lime-200', icon: Heart },
  PENDING: { id: 'PENDING', label: '分析中...', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Loader2 },
  NONE: { id: 'NONE', label: '未分類', color: 'bg-gray-50 text-gray-400 border-gray-100', icon: Tag }
};

// APIキーはサーバー側で管理されるため削除
const App = () => {
  const [goals, setGoals] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('goals');
  const [expandedGoalId, setExpandedGoalId] = useState(null);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const todayStr = useMemo(() => today.toISOString().split('T')[0], []);

  // データの読み込み
  useEffect(() => {
    fetch('/api/goals')
      .then(res => res.json())
      .then(data => setGoals(data))
      .catch(err => console.error('Failed to load goals:', err));
  }, []);

  // データの保存
  // データの保存
  useEffect(() => {
    if (goals.length === 0) return; // 初期ロード時の空データ保存防止
    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goals)
    }).catch(err => console.error('Failed to save goals:', err));
  }, [goals]);

  // 習慣の達成率計算
  const getHabitStats = (goal) => {
    if (goal.category !== 'HABIT' || !goal.createdAt) return { rate: 0, daysElapsed: 0, count: 0 };

    const start = new Date(goal.createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - start);
    let daysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysElapsed === 0) daysElapsed = 1;
    if (daysElapsed > 30) daysElapsed = 30;

    let count = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (goal.history && goal.history[ds]) count++;
    }

    const rate = Math.round((count / daysElapsed) * 100);
    return { rate, daysElapsed, count };
  };

  // AIによる目標分析
  const analyzeGoal = async (text) => {
    const systemPrompt = `
      あなたは目標達成の戦略コンサルタント兼メンターです。
      入力された新年の目標を分析し、JSON形式で返答してください。
      
      【重要：試験・期限の取り扱い】
      1. 目標に「試験」「合格」「資格」が含まれる場合、isExamをtrueにし、その試験の一般的難易度に基づいた具体的な学習ステップを提示してください。
      2. 目標に「～月まで」等の期限がある場合、2026年1月を起点として期限から逆算したロードマップを作成してください。
      3. 期限に関わらず「チャレンジ系」は必ず1月から12月までの【全12ヶ月分】のロードマップをroadmapフィールドに作成してください。
      4. 試験勉強等の場合、合格・達成に不可欠な「今日の重点TODO」を【厳選して3つ】作成してください。
      5. 期限を過ぎた月には「メンテナンス」や「次のステップ」を割り当て、空欄にしないでください。

      返答形式 (JSONのみ):
      {
        "category": "CHALLENGE" | "HABIT" | "HOBBY",
        "deadlineMonth": 5, 
        "isExam": true, 
        "roadmap": [{"month": 1, "task": "基礎固め"}, {"month": 2, "task": "..."}, ... {"month": 12, "task": "..."}],
        "subTasks": ["TODO1", "TODO2", "TODO3"], 
        "advice": "...", 
        "rewardIdea": "..."
      }
    `;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `目標: ${text}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = await response.json();
      const content = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
      if (content.subTasks && content.subTasks.length > 3) content.subTasks = content.subTasks.slice(0, 3);
      return content;
    } catch (error) {
      console.error(error);
      return { category: 'NONE', roadmap: [], subTasks: [], advice: "分析に失敗しました。", };
    }
  };

  // 目標の追加
  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || goals.length >= 100) return;
    const tempId = Date.now();
    const newGoal = { id: tempId, text: inputValue, completed: false, category: 'PENDING', subTasks: [], history: {}, createdAt: new Date().toISOString() };
    setGoals([newGoal, ...goals]);
    setInputValue('');
    setIsAnalyzing(true);
    const analysis = await analyzeGoal(inputValue);
    setGoals(prev => prev.map(g => g.id === tempId ? {
      ...g,
      category: analysis.category,
      deadlineMonth: analysis.deadlineMonth,
      isExam: analysis.isExam,
      roadmap: analysis.roadmap || [],
      subTasks: (analysis.subTasks || []).map((t, i) => ({ id: `${tempId}_${i}`, text: t, completed: false })),
      advice: analysis.advice,
      rewardIdea: analysis.rewardIdea,
    } : g));
    setIsAnalyzing(false);
  };

  const toggleGoal = (id) => setGoals(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  const deleteGoal = (id) => setGoals(goals.filter(g => g.id !== id));
  const changeCategory = (goalId, newCategory) => {
    setGoals(goals.map(g => g.id === goalId ? { ...g, category: newCategory } : g));
  };
  const toggleSubTask = (goalId, subId) => setGoals(goals.map(g => g.id === goalId ? {
    ...g, subTasks: g.subTasks.map(st => st.id === subId ? { ...st, completed: !st.completed } : st)
  } : g));
  const toggleHabit = (id) => setGoals(goals.map(g => {
    if (g.id !== id) return g;
    const history = { ...g.history };
    history[todayStr] = !history[todayStr];
    return { ...g, history };
  }));

  const filteredGoals = useMemo(() => goals.filter(g => (filter === 'ALL' || g.category === filter) && g.text.toLowerCase().includes(searchTerm.toLowerCase())), [goals, filter, searchTerm]);

  const dailyChallengeGoals = useMemo(() => {
    return goals.filter(g => {
      if (g.category !== 'CHALLENGE' || g.completed) return false;
      if (!g.deadlineMonth) return true;
      if (currentMonth <= g.deadlineMonth) return true;
      if (currentMonth > 9 && g.deadlineMonth < 6) return true;
      return false;
    });
  }, [goals, currentMonth]);

  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.completed).length,
    challenge: goals.filter(g => g.category === 'CHALLENGE').length,
    habit: goals.filter(g => g.category === 'HABIT').length,
    hobby: goals.filter(g => g.category === 'HOBBY').length,
  };

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 pb-24 font-sans selection:bg-emerald-100">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-black flex items-center gap-2 text-emerald-900">
              <Sparkles className="text-emerald-600 fill-emerald-600" size={24} /> 2026 Vision 100
            </h1>
            <div className="bg-emerald-700 px-3 py-1 rounded-full shadow-lg shadow-emerald-100">
              <span className="text-xs font-black text-white">達成率 {Math.round((stats.completed / (stats.total || 1)) * 100)}%</span>
            </div>
          </div>
          <div className="flex p-1 bg-emerald-50/50 rounded-2xl border border-emerald-100">
            <button onClick={() => setCurrentView('goals')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${currentView === 'goals' ? 'bg-white shadow text-emerald-800' : 'text-emerald-600/60 hover:text-emerald-700'}`}>
              <Trophy size={16} /> 全目標
            </button>
            <button onClick={() => setCurrentView('daily')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${currentView === 'daily' ? 'bg-white shadow text-emerald-800' : 'text-emerald-600/60 hover:text-emerald-700'}`}>
              <ListTodo size={16} /> 今日のTODO
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {currentView === 'goals' ? (
          <>
            {/* 入力エリア */}
            <form onSubmit={handleAddGoal} className="mb-8 relative group">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="新しい目標（例：毎晩10分のストレッチ）"
                disabled={isAnalyzing}
                className="w-full pl-6 pr-16 py-5 bg-white border-2 border-emerald-100 rounded-[2rem] focus:border-emerald-600 outline-none shadow-sm text-lg transition-all focus:ring-4 focus:ring-emerald-50"
              />
              <button disabled={isAnalyzing || !inputValue.trim()} className="absolute right-3 top-3 p-3 bg-emerald-700 text-white rounded-full hover:bg-emerald-800 disabled:bg-slate-300 transition-all shadow-lg active:scale-90">
                {isAnalyzing ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}
              </button>
            </form>

            {/* カテゴリーフィルタ */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {['CHALLENGE', 'HABIT', 'HOBBY'].map(id => (
                <button key={id} onClick={() => setFilter(filter === id ? 'ALL' : id)} className={`p-4 rounded-[2rem] border-2 transition-all flex flex-col items-center ${filter === id ? 'border-emerald-600 bg-emerald-50 shadow-inner' : 'bg-white border-emerald-50 shadow-sm'}`}>
                  {React.createElement(CATEGORIES[id].icon, { size: 24, className: filter === id ? 'text-emerald-700' : 'text-emerald-300' })}
                  <span className={`text-[10px] font-black mt-1 uppercase ${filter === id ? 'text-emerald-800' : 'text-slate-400'}`}>{CATEGORIES[id].label}</span>
                  <span className={`text-2xl font-black leading-tight ${filter === id ? 'text-emerald-900' : 'text-slate-700'}`}>{stats[id.toLowerCase()]}</span>
                </button>
              ))}
            </div>

            {/* 目標リスト */}
            <div className="space-y-4">
              {filteredGoals.map(goal => {
                const isExpanded = expandedGoalId === goal.id;
                const cat = CATEGORIES[goal.category] || CATEGORIES.NONE;
                const habitStats = goal.category === 'HABIT' ? getHabitStats(goal) : null;
                const isWarning = habitStats && habitStats.rate < 80 && habitStats.daysElapsed >= 3;

                return (
                  <div key={goal.id} className={`bg-white rounded-[2.5rem] border transition-all shadow-sm ${goal.completed ? 'opacity-60 border-emerald-50 bg-emerald-50/20' : isWarning ? 'border-red-200 bg-red-50/10' : 'border-emerald-100'}`}>
                    <div className="p-6 flex items-center gap-5 cursor-pointer" onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}>
                      <button onClick={(e) => { e.stopPropagation(); toggleGoal(goal.id); }} className={`shrink-0 transition-transform active:scale-75 ${goal.completed ? 'text-emerald-600' : 'text-emerald-200 hover:text-emerald-600'}`}>
                        {goal.completed ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                      </button>
                      <div className="flex-grow">
                        <div className="flex items-center gap-2">
                          <h3 className={`text-lg font-bold text-emerald-950 leading-snug ${goal.completed ? 'line-through text-slate-400 font-normal italic' : ''}`}>{goal.text}</h3>
                          {isWarning && <AlertCircle className="text-red-500 animate-pulse shrink-0" size={20} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-widest ${cat.color}`}>{cat.label}</span>
                          {goal.category === 'HABIT' && habitStats && (
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full border flex items-center gap-1 ${isWarning ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                              {isWarning ? <TrendingUp className="rotate-180" size={10} /> : <TrendingUp size={10} />}
                              達成率 {habitStats.rate}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3 shrink-0 text-emerald-300">
                        <button onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id); }} className="hover:text-red-500 transition-colors p-1"><Trash2 size={18} /></button>
                        <div className={`p-1.5 bg-emerald-50 rounded-full transition-transform ${isExpanded ? 'rotate-180 bg-emerald-100 text-emerald-800' : ''}`}><ChevronDown size={20} /></div>
                      </div>
                    </div>

                    {/* 詳細エリア */}
                    {isExpanded && (
                      <div className="px-8 pb-8 border-t border-emerald-50 bg-emerald-50/10 space-y-6 pt-6 animate-fadeIn">

                        {/* 達成率警告 */}
                        {isWarning && (
                          <div className="bg-red-100 border-2 border-red-200 p-4 rounded-3xl flex items-center gap-4 text-red-800">
                            <div className="bg-red-500 p-2 rounded-full text-white"><AlertCircle size={24} /></div>
                            <div>
                              <p className="font-black text-sm">要注意：達成率が80%を切っています！</p>
                              <p className="text-xs font-bold opacity-80">直近{habitStats.daysElapsed}日間の実施率は {habitStats.rate}% です。</p>
                            </div>
                          </div>
                        )}

                        {/* カテゴリー変更 */}
                        <div>
                          <h4 className="text-[11px] font-black text-emerald-800/40 uppercase tracking-widest mb-3 flex items-center gap-2"><RefreshCcw size={14} className="text-emerald-400" /> カテゴリーを変更</h4>
                          <div className="flex gap-2 p-1 bg-white/50 rounded-2xl border border-emerald-50 w-fit">
                            {['CHALLENGE', 'HABIT', 'HOBBY'].map((type) => (
                              <button
                                key={type}
                                onClick={() => changeCategory(goal.id, type)}
                                className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all ${goal.category === type
                                  ? `${CATEGORIES[type].color} shadow-sm ring-1 ring-emerald-200`
                                  : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-700'
                                  }`}
                              >
                                {CATEGORIES[type].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* チャレンジ系詳細 */}
                        {goal.category === 'CHALLENGE' && (
                          <div className="space-y-8">
                            <div>
                              <h4 className="text-[11px] font-black text-emerald-800/40 uppercase tracking-widest mb-4 flex items-center gap-2"><CalendarDays size={14} className="text-emerald-400" /> 年間ロードマップ</h4>
                              <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-100">
                                {(goal.roadmap || []).map((step, idx) => {
                                  const isCurrent = currentMonth === step.month;
                                  const isPassed = currentMonth > step.month;
                                  return (
                                    <div key={idx} className={`relative pl-8 transition-all ${isCurrent ? 'scale-[1.02] z-10' : ''}`}>
                                      <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isCurrent ? 'bg-emerald-700 border-emerald-700 text-white shadow-lg' :
                                        isPassed ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-white border-emerald-100 text-slate-300'
                                        }`}>
                                        <span className="text-[10px] font-black">{step.month}</span>
                                      </div>
                                      <div className={`p-4 rounded-2xl border transition-all ${isCurrent ? 'bg-white border-emerald-600 shadow-md ring-1 ring-emerald-50' :
                                        isPassed ? 'bg-white/50 border-emerald-50 opacity-80' : 'bg-white border-slate-100'
                                        }`}>
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${isCurrent ? 'text-emerald-700' : 'text-slate-400'}`}>
                                          {step.month}月
                                          {isCurrent && <span className="ml-2 bg-emerald-100 px-2 py-0.5 rounded text-[9px]">今月のステップ</span>}
                                        </span>
                                        <p className={`text-sm font-bold leading-relaxed mt-1 ${isCurrent ? 'text-emerald-950' : 'text-slate-600'}`}>{step.task}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-emerald-800/40 uppercase tracking-widest mb-4 flex items-center gap-2"><ListTodo size={14} className="text-emerald-400" /> 今日の重点TODO</h4>
                              <div className="space-y-2">
                                {goal.subTasks?.map(st => (
                                  <div key={st.id} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-emerald-50 shadow-sm hover:border-emerald-200 transition-all">
                                    <button onClick={() => toggleSubTask(goal.id, st.id)} className={st.completed ? 'text-emerald-600' : 'text-emerald-200'}>{st.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}</button>
                                    <span className={st.completed ? 'line-through text-slate-400 font-normal' : 'text-emerald-900 font-bold'}>{st.text}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 習慣系詳細 */}
                        {goal.category === 'HABIT' && (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-emerald-700 p-5 rounded-[2rem] shadow-lg shadow-emerald-100">
                                <h4 className="text-[11px] font-black text-emerald-200 mb-2 uppercase tracking-widest">継続ステータス</h4>
                                <div className="text-white">
                                  <div className="text-3xl font-black">{habitStats.rate}<span className="text-sm ml-1">%</span></div>
                                  <p className="text-[10px] font-bold opacity-70">過去{habitStats.daysElapsed}日間の実施状況</p>
                                </div>
                              </div>
                              <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-200">
                                <h4 className="text-[11px] font-black text-emerald-800 mb-2 uppercase tracking-widest">アドバイス</h4>
                                <p className="text-sm text-emerald-900 font-bold leading-relaxed">{goal.advice || "分析中..."}</p>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-[11px] font-black text-emerald-800/40 mb-4 uppercase tracking-[0.2em]">継続ログ</h4>
                              <div className="flex flex-wrap gap-2 p-5 bg-white rounded-[2rem] border border-emerald-100">
                                {[...Array(60)].map((_, i) => {
                                  const d = new Date(); d.setDate(d.getDate() - (59 - i));
                                  const ds = d.toISOString().split('T')[0];
                                  return (
                                    <div key={i} className={`w-3.5 h-3.5 rounded-md ${goal.history[ds] ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                        {/* 趣味系詳細 */}
                        {goal.category === 'HOBBY' && (
                          <div className="bg-emerald-900 p-6 rounded-[2.5rem] shadow-xl text-white">
                            <h4 className="text-[11px] font-black text-emerald-300 mb-2 uppercase tracking-widest">楽しみを倍増させるヒント</h4>
                            <p className="text-sm font-bold leading-relaxed">{goal.advice || "ヒントを生成中です..."}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* 今日画面 */
          <div className="space-y-10 animate-fadeIn">
            <section>
              <h2 className="text-xs font-black text-emerald-800/40 mb-6 flex items-center gap-3 uppercase px-4 tracking-[0.2em]"><Repeat size={20} className="text-emerald-600" /> 今日の習慣</h2>
              <div className="grid grid-cols-1 gap-4">
                {goals.filter(g => g.category === 'HABIT').map(g => {
                  const stats = getHabitStats(g);
                  const isWarning = stats.rate < 80 && stats.daysElapsed >= 3;
                  return (
                    <button key={g.id} onClick={() => toggleHabit(g.id)} className={`w-full p-6 rounded-[2.5rem] border-2 flex items-center gap-5 transition-all shadow-sm active:scale-[0.98] ${g.history[todayStr] ? 'bg-emerald-700 border-emerald-800 text-white shadow-emerald-200 shadow-lg' : isWarning ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-white text-emerald-900 hover:border-emerald-200'}`}>
                      {g.history[todayStr] ? <CheckCircle2 className="text-emerald-200 shrink-0" size={32} /> : <Circle className={`${isWarning ? 'text-red-200' : 'text-emerald-50'} shrink-0`} size={32} />}
                      <div className="flex flex-col items-start text-left">
                        <span className="text-lg font-black leading-tight">{g.text}</span>
                        <span className={`text-[10px] font-bold ${g.history[todayStr] ? 'text-emerald-200' : isWarning ? 'text-red-500' : 'text-emerald-400'}`}>達成率 {stats.rate}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-black text-emerald-800/40 mb-6 flex items-center gap-3 uppercase px-4 tracking-[0.2em]"><Trophy size={20} className="text-emerald-600" /> 今日のアクション</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {dailyChallengeGoals.map(g => (
                  <div key={g.id} className="bg-white rounded-[2.5rem] border border-emerald-50 p-6 shadow-sm border-b-8 border-b-emerald-700/10">
                    <p className={`text-[10px] font-black px-4 py-1.5 rounded-full inline-block uppercase tracking-widest mb-4 ${g.isExam ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}`}>{g.text}</p>
                    <div className="space-y-3">
                      {g.subTasks.filter(st => !st.completed).map(st => (
                        <button key={st.id} onClick={() => toggleSubTask(g.id, st.id)} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-emerald-50/50 hover:bg-emerald-700 hover:text-white text-left transition-all active:scale-[0.96] shadow-sm group">
                          <Circle size={24} className="text-emerald-200 shrink-0 group-hover:text-emerald-300" />
                          <span className="text-sm font-bold leading-snug group-hover:text-white text-emerald-950">{st.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
