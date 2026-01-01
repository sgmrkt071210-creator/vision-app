import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, CheckCircle2, Circle, Trash2, Tag, Trophy, Repeat, Heart, Loader2, ListTodo, Search, ChevronDown, CalendarDays, Sparkles, AlertCircle, TrendingUp, RefreshCcw, Check, X } from 'lucide-react';
// Did NOT import MessageSquare, Send to remove chat UI

// カテゴリー定義
const CATEGORIES = {
  CHALLENGE: { id: 'CHALLENGE', label: 'チャレンジ系', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Trophy },
  HABIT: { id: 'HABIT', label: '習慣系', color: 'bg-green-100 text-green-800 border-green-200', icon: Repeat },
  HOBBY: { id: 'HOBBY', label: '趣味系', color: 'bg-lime-100 text-lime-800 border-lime-200', icon: Heart },
  PENDING: { id: 'PENDING', label: '分析中...', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Loader2 },
  NONE: { id: 'NONE', label: '未分類', color: 'bg-gray-50 text-gray-400 border-gray-100', icon: Tag }
};

const App = () => {
  const [goals, setGoals] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState('goals');
  const [expandedGoalId, setExpandedGoalId] = useState(null);

  // User Auth State
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('vision_app_username') || null);
  const [authMode, setAuthMode] = useState('LOGIN'); // 'LOGIN' or 'REGISTER'
  const [authInput, setAuthInput] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  // REMOVED: Chat State

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const todayStr = useMemo(() => today.toISOString().split('T')[0], []);

  // データの読み込み (ユーザーごと)
  useEffect(() => {
    if (!currentUser) return;
    fetch(`/api/goals?username=${encodeURIComponent(currentUser)}`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setGoals(data); })
      .catch(err => console.error('Failed to load goals:', err));
  }, [currentUser]);

  // データの保存 (ユーザーごと)
  useEffect(() => {
    if (!currentUser || goals.length === 0) return;
    const timer = setTimeout(() => {
      fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, goals })
      }).catch(err => console.error('Failed to save goals:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [goals, currentUser]);

  // --- Auth Handlers ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'LOGIN' ? '/api/login' : '/api/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authInput)
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('vision_app_username', data.username);
        setCurrentUser(data.username);
        setGoals([]);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Network error occurred');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vision_app_username');
    setCurrentUser(null);
    setGoals([]);
    setAuthInput({ username: '', password: '' });
    setAuthMode('LOGIN');
  };

  // --- Goal Handlers ---
  const getHabitStats = (goal) => {
    if (goal.category !== 'HABIT' || !goal.createdAt) return { rate: 0, daysElapsed: 0, count: 0 };
    const start = new Date(goal.createdAt);
    const now = new Date();
    const daysElapsed = Math.max(1, Math.min(30, Math.ceil(Math.abs(now - start) / (86400000))));
    let count = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date(); d.setDate(now.getDate() - i);
      if (goal.history && goal.history[d.toISOString().split('T')[0]]) count++;
    }
    return { rate: Math.round((count / daysElapsed) * 100), daysElapsed, count };
  };

  const analyzeGoal = async (text) => {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `目標: ${text}` }] }],
          systemInstruction: {
            parts: [{
              text: `
            あなたは目標達成コーチです。ユーザーの目標を分析しJSONで返してください。
            category: "CHALLENGE"|"HABIT"|"HOBBY"
            deadlineMonth: 数値
            isExam: true/false
            roadmap: [{"month":1,"task":"..."}...] (必ず1-12月)
            subTasks: ["TODO1","TODO2","TODO3"]
            advice: "一言アドバイス"
            rewardIdea: "ご褒美アイデア"
          ` }]
          },
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const result = await response.json();

      let rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No text content");

      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');

      const content = JSON.parse(rawText);
      // No truncation needed
      return content;
    } catch (error) {
      console.error(error);
      return { category: 'NONE', roadmap: [], subTasks: [], advice: "分析失敗" };
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || goals.length >= 100) return;
    const tempId = Date.now();
    const newGoal = { id: tempId, text: inputValue, completed: false, category: 'PENDING', subTasks: [], history: {}, createdAt: new Date().toISOString() };
    setGoals([newGoal, ...goals]);
    setInputValue('');
    setIsAnalyzing(true);
    const analysis = await analyzeGoal(inputValue);
    setGoals(prev => prev.map(g => g.id === tempId ? { ...g, ...analysis } : g));
    setIsAnalyzing(false);
  };

  const toggleGoal = (id) => setGoals(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  const deleteGoal = (id) => setGoals(goals.filter(g => g.id !== id));

  const toggleSubTask = (goalId, text) => setGoals(goals.map(g => {
    if (g.id !== goalId) return g;
    const done = g.doneSubTasks || [];
    const newDone = done.includes(text) ? done.filter(t => t !== text) : [...done, text];
    return { ...g, doneSubTasks: newDone };
  }));

  const toggleHabit = (id) => setGoals(goals.map(g => {
    if (g.id !== id) return g;
    const h = { ...g.history };
    if (h[todayStr]) delete h[todayStr];
    else h[todayStr] = true;
    return { ...g, history: h };
  }));

  // REMOVED: Chat Handlers

  const filteredGoals = useMemo(() => goals.filter(g => (filter === 'ALL' || g.category === filter) && g.text.toLowerCase().includes(searchTerm.toLowerCase())), [goals, filter, searchTerm]);
  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.completed).length,
    challenge: goals.filter(g => g.category === 'CHALLENGE').length,
    habit: goals.filter(g => g.category === 'HABIT').length,
    hobby: goals.filter(g => g.category === 'HOBBY').length,
  };

  // --- Daily View Logic ---
  const dailyTasks = useMemo(() => {
    const items = [];

    // 1. Uncompleted Habits for today
    goals.filter(g => g.category === 'HABIT').forEach(g => {
      const isDoneToday = g.history && g.history[todayStr];
      items.push({
        type: 'HABIT',
        goalId: g.id,
        text: g.text,
        isDone: !!isDoneToday
      });
    });

    // 2. Uncompleted Subtasks
    goals.forEach(g => {
      if (g.subTasks && g.subTasks.length > 0) {
        const done = g.doneSubTasks || [];
        g.subTasks.slice(0, 3).forEach(t => {
          items.push({
            type: 'SUBTASK',
            goalId: g.id,
            text: t,
            parentText: g.text,
            isDone: done.includes(t)
          });
        });
      }
    });
    return items;
  }, [goals, todayStr]);


  // --- Auth UI ---
  // (Simplified for brevity, same structure)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-[2.5rem] shadow-xl p-10 w-full max-w-md border border-emerald-100">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-emerald-900 tracking-tight">Vision App</h1>
            <p className="text-slate-500 mt-2 font-medium">ログインしてスタート</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" value={authInput.username} onChange={e => setAuthInput({ ...authInput, username: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl" placeholder="ユーザー名" required />
            <input type="password" value={authInput.password} onChange={e => setAuthInput({ ...authInput, password: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl" placeholder="パスワード" required />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl">Play</button>
          </form>
          <div className="mt-8 text-center"><button onClick={() => setAuthMode(authMode === 'LOGIN' ? 'REGISTER' : 'LOGIN')} className="text-emerald-600 underline">切り替え</button></div>
        </div>
      </div>
    );
  }

  // --- Main App UI ---
  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 pb-24 font-sans selection:bg-emerald-100 relative">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-black flex items-center gap-2 text-emerald-900">
              <Sparkles className="text-emerald-600 fill-emerald-600" size={24} /> 2026 Vision 100
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 hidden sm:block">User: {currentUser}</span>
              <button onClick={handleLogout} className="text-[10px] font-bold text-red-400 hover:text-red-500 hover:underline">ログアウト</button>
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
        {currentView === 'goals' && (
          <>
            <form onSubmit={handleAddGoal} className="mb-8 relative group">
              <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="新しい目標..." disabled={isAnalyzing} className="w-full pl-6 pr-16 py-5 bg-white border-2 border-emerald-100 rounded-[2rem] focus:border-emerald-600 outline-none shadow-sm text-lg transition-all focus:ring-4 focus:ring-emerald-50" />
              <button disabled={isAnalyzing || !inputValue.trim()} className="absolute right-3 top-3 p-3 bg-emerald-700 text-white rounded-full hover:bg-emerald-800 disabled:bg-slate-300 transition-all shadow-lg active:scale-90">{isAnalyzing ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}</button>
            </form>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {['CHALLENGE', 'HABIT', 'HOBBY'].map(id => (
                <button key={id} onClick={() => setFilter(filter === id ? 'ALL' : id)} className={`p-4 rounded-[2rem] border-2 transition-all flex flex-col items-center ${filter === id ? 'border-emerald-600 bg-emerald-50 shadow-inner' : 'bg-white border-emerald-50 shadow-sm'}`}>
                  {React.createElement(CATEGORIES[id].icon, { size: 24, className: filter === id ? 'text-emerald-700' : 'text-emerald-300' })}
                  <span className={`text-[10px] font-black mt-1 uppercase ${filter === id ? 'text-emerald-800' : 'text-slate-400'}`}>{CATEGORIES[id].label}</span>
                  <span className={`text-2xl font-black leading-tight ${filter === id ? 'text-emerald-900' : 'text-slate-700'}`}>{stats[id.toLowerCase()]}</span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {filteredGoals.map(goal => {
                const isExpanded = expandedGoalId === goal.id;
                const cat = CATEGORIES[goal.category] || CATEGORIES.NONE;
                const habitStats = goal.category === 'HABIT' ? getHabitStats(goal) : null;
                const isWarning = habitStats && habitStats.rate < 80 && habitStats.daysElapsed >= 3;

                return (
                  <div key={goal.id} className={`bg-white rounded-[2.5rem] border transition-all shadow-sm ${goal.completed ? 'opacity-60 border-emerald-50 bg-emerald-50/20' : isWarning ? 'border-red-200 bg-red-50/10' : 'border-emerald-100'}`}>
                    <div className="p-6 cursor-pointer" onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}>
                      <div className="flex items-center gap-5">
                        <button onClick={(e) => { e.stopPropagation(); toggleGoal(goal.id); }} className={`shrink-0 transition-transform active:scale-75 ${goal.completed ? 'text-emerald-600' : 'text-emerald-200 hover:text-emerald-600'}`}>
                          {goal.completed ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                        </button>
                        <div className="flex-grow">
                          <h3 className={`text-lg font-bold text-emerald-950 leading-snug ${goal.completed ? 'line-through text-slate-400' : ''}`}>{goal.text}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-widest ${cat.color}`}>{cat.label}</span>
                            {goal.category === 'HABIT' && habitStats && (
                              <span className={`text-[10px] font-black px-2 py-1 rounded-full border flex items-center gap-1 ${isWarning ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                <TrendingUp size={10} /> 達成率 {habitStats.rate}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {/* REMOVED: Chat Button */}
                          <button onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id); }} className="p-2 hover:bg-red-50 text-emerald-200 hover:text-red-500 rounded-full transition-colors"><Trash2 size={18} /></button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-2 pt-6 pb-2 border-t border-emerald-50 mt-4 animate-fadeIn">
                          {/* TODO List */}
                          {goal.subTasks && goal.subTasks.length > 0 && (
                            <div className="mb-4 space-y-2">
                              <h4 className="text-xs font-bold text-emerald-800/50 uppercase">TODO List</h4>
                              {goal.subTasks.map((task, i) => {
                                const isDone = (goal.doneSubTasks || []).includes(task);
                                return (
                                  <div key={i} onClick={(e) => { e.stopPropagation(); toggleSubTask(goal.id, task); }} className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all hover:bg-white ${isDone ? 'bg-emerald-100/50 border-emerald-100 text-emerald-800' : 'bg-white border-transparent hover:border-emerald-100 text-slate-700'}`}>
                                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                                      {isDone && <Check size={12} className="text-white" />}
                                    </div>
                                    <span className={`text-sm font-medium ${isDone ? 'line-through opacity-60' : ''}`}>{task}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {goal.category === 'CHALLENGE' && (
                            <div className="space-y-4">
                              <h4 className="text-xs font-bold text-emerald-800/50 uppercase">ロードマップ</h4>
                              <div className="pl-4 border-l-2 border-emerald-100 space-y-4">
                                {(goal.roadmap || []).filter(s => s.month >= currentMonth).map((step, i) => (
                                  <div key={i} className="text-sm">
                                    <span className="font-bold text-emerald-700 mr-2">{step.month}月</span>
                                    <span className="text-slate-600">{step.task}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {goal.advice && <div className="mt-4 p-4 bg-emerald-50/50 rounded-2xl text-sm text-emerald-800 font-medium">💡 {goal.advice}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {currentView === 'daily' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-6">
              <ListTodo className="text-emerald-600" />
              <h2 className="text-xl font-black text-emerald-900">今日のタスク</h2>
            </div>

            {dailyTasks.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[2.5rem] border border-emerald-100">
                <Sparkles className="mx-auto text-emerald-200 mb-4" size={48} />
                <p className="text-slate-500 font-bold">今日のタスクはありません！</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 1. Habits */}
                {dailyTasks.filter(t => t.type === 'HABIT').length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-800/50 uppercase ml-2">習慣 (Habits)</h3>
                    {dailyTasks.filter(t => t.type === 'HABIT').map((task, i) => (
                      <div key={`habit-${task.goalId}`} onClick={() => toggleHabit(task.goalId)} className={`bg-white p-4 rounded-xl border-2 flex items-center gap-4 cursor-pointer transition-all ${task.isDone ? 'border-emerald-200 bg-emerald-50' : 'border-emerald-100 hover:border-emerald-300'}`}>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${task.isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                          {task.isDone && <Check size={14} className="text-white" />}
                        </div>
                        <span className={`font-bold text-slate-700 ${task.isDone ? 'line-through opacity-50' : ''}`}>{task.text}</span>
                        <span className="ml-auto text-[10px] font-black uppercase text-emerald-500 bg-emerald-100 px-2 py-1 rounded">HABIT</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Subtasks */}
                {dailyTasks.filter(t => t.type === 'SUBTASK').length > 0 && (
                  <div className="space-y-3 mt-6">
                    <h3 className="text-xs font-bold text-emerald-800/50 uppercase ml-2">アクション (Actions)</h3>
                    {dailyTasks.filter(t => t.type === 'SUBTASK').map((task, i) => (
                      <div key={`sub-${task.goalId}-${i}`} onClick={() => toggleSubTask(task.goalId, task.text)} className={`bg-white p-4 rounded-xl border-2 flex items-center gap-4 cursor-pointer transition-all ${task.isDone ? 'bg-stone-50 border-slate-100 opacity-60' : 'border-emerald-100 hover:border-emerald-300'}`}>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${task.isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                          {task.isDone && <Check size={14} className="text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] text-slate-400 font-bold mb-1">{task.parentText}</div>
                          <div className={`font-bold text-slate-800 ${task.isDone ? 'line-through' : ''}`}>{task.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* REMOVED: Chat Modal */}
    </div>
  );
};

export default App;
