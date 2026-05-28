import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('experience');

  // --- 공통 상태 (맵 데이터) ---
  const [nodeCount, setNodeCount] = useState(8);
  const [maxFuel, setMaxFuel] = useState(650);
  const [targets, setTargets] = useState([]);
  
  // --- MILP 최적해 상태 ---
  const [uavPaths, setUavPaths] = useState(null);
  const [isSolving, setIsSolving] = useState(false);
  const [milpTime, setMilpTime] = useState(0);

  // --- 체험(Game) 상태 ---
  const [humanPaths, setHumanPaths] = useState({ uav1: [], uav2: [] });
  const [activeUAV, setActiveUAV] = useState('uav1');
  const [humanTime, setHumanTime] = useState({ start: null, elapsed: 0 });
  
  // UX State
  const [showReport, setShowReport] = useState(false);
  const [hideReportModal, setHideReportModal] = useState(false); 
  const [isReviewMode, setIsReviewMode] = useState(false); 
  const [fuelWarning, setFuelWarning] = useState('');
  const [countdown, setCountdown] = useState(3);

  // --- 배경음악 상태 ---
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  // 자동 리뷰 모드 전환 (3초 타이머)
  useEffect(() => {
    let timer;
    if (showReport && !hideReportModal && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (showReport && !hideReportModal && countdown === 0) {
      setHideReportModal(true);
      setIsReviewMode(true);
    }
    return () => clearTimeout(timer);
  }, [showReport, hideReportModal, countdown]);

  // 맵 생성
  useEffect(() => {
    generateTargets();
  }, [nodeCount]);

  const generateTargets = () => {
    const newTargets = [];
    for (let i = 0; i < nodeCount; i++) {
      let x = 0, y = 0, isValid = false;
      while (!isValid) {
        x = 50 + Math.random() * 400; 
        y = 50 + Math.random() * 330; 
        isValid = true;
        if (Math.hypot(x - 250, y - 250) < 55) isValid = false;
        for (const t of newTargets) {
          if (Math.hypot(x - t.x, y - t.y) < 45) isValid = false;
        }
      }
      const val = Math.floor(Math.random() * 9 + 1) * 10;
      newTargets.push({ x, y, val });
    }
    setTargets(newTargets);
    setUavPaths(null); 
    resetHumanGame();
  };

  const resetHumanGame = () => {
    setHumanPaths({ uav1: [], uav2: [] });
    setActiveUAV('uav1');
    setHumanTime({ start: null, elapsed: 0 });
    setShowReport(false);
    setIsReviewMode(false);
    setHideReportModal(false);
    setFuelWarning('');
    setCountdown(3);
  };

  const toggleBGM = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.log("Audio play failed", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const calculatePathMetrics = (pathIndices) => {
    if (!pathIndices || pathIndices.length === 0) return { dist: 0, val: 0 };
    const nodes = [{ id: 0, x: 250, y: 250, val: 0 }, ...targets];
    let dist = 0, val = 0, curr = 0;
    for (let i = 0; i < pathIndices.length; i++) {
      const next = pathIndices[i];
      dist += Math.hypot(nodes[curr].x - nodes[next].x, nodes[curr].y - nodes[next].y);
      val += nodes[next].val;
      curr = next;
    }
    dist += Math.hypot(nodes[curr].x - nodes[0].x, nodes[curr].y - nodes[0].y);
    return { dist, val };
  };

  const handleTargetClick = (targetIndex) => {
    if (showReport || isReviewMode) return; 
    if (humanTime.start === null) setHumanTime({ start: performance.now(), elapsed: 0 });

    const tIdx = targetIndex + 1; 
    const inUav1 = humanPaths.uav1.includes(tIdx);
    const inUav2 = humanPaths.uav2.includes(tIdx);

    if ((activeUAV === 'uav1' && inUav2) || (activeUAV === 'uav2' && inUav1)) {
      showWarning('⚠️ 상대 무인기가 이미 점유한 표적입니다.');
      return;
    }

    const currentPath = humanPaths[activeUAV];
    if (currentPath.includes(tIdx)) {
      if (currentPath[currentPath.length - 1] === tIdx) {
        setHumanPaths({ ...humanPaths, [activeUAV]: currentPath.slice(0, -1) });
      }
      return;
    }

    const newPath = [...currentPath, tIdx];
    const metrics = calculatePathMetrics(newPath);

    if (metrics.dist > maxFuel) {
      showWarning(`⚠️ 연료 한계 도달! (${activeUAV === 'uav1' ? '알파' : '브라보'}) 드론이 기지로 돌아올 수 없습니다.`);
      return;
    }
    setHumanPaths({ ...humanPaths, [activeUAV]: newPath });
  };

  const showWarning = (msg) => {
    setFuelWarning(msg);
    setTimeout(() => setFuelWarning(''), 2500);
  };

  const submitHumanSolution = () => {
    const end = performance.now();
    const elapsed = end - (humanTime.start || end);
    setHumanTime(prev => ({ ...prev, elapsed }));
    
    if (!uavPaths) solveMILP(true);
    
    setCountdown(3);
    setShowReport(true);
    setHideReportModal(false);
    setIsReviewMode(false);
  };

  // --- DP + 비트마스킹을 활용한 MILP 최적해 시뮬레이션 ---
  const handleSolve = () => {
    setIsSolving(true);
    setTimeout(() => { solveMILP(); setIsSolving(false); }, 150);
  };

  const solveMILP = (silent = false) => {
    const t0 = performance.now();
    const N = targets.length;
    const nodes = [{ id: 0, x: 250, y: 250, val: 0 }, ...targets];
    
    const dist = Array(N + 1).fill(0).map(() => Array(N + 1).fill(0));
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        dist[i][j] = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      }
    }

    const numSubsets = 1 << N; 
    const dp = Array(numSubsets).fill(0).map(() => Array(N + 1).fill(Infinity));
    const parent = Array(numSubsets).fill(0).map(() => Array(N + 1).fill(-1));

    for (let i = 1; i <= N; i++) dp[1 << (i - 1)][i] = dist[0][i];

    for (let mask = 1; mask < numSubsets; mask++) {
      for (let i = 1; i <= N; i++) {
        if ((mask & (1 << (i - 1))) !== 0) {
          const prevMask = mask ^ (1 << (i - 1));
          if (prevMask === 0) continue;
          for (let j = 1; j <= N; j++) {
            if ((prevMask & (1 << (j - 1))) !== 0) {
              const cost = dp[prevMask][j] + dist[j][i];
              if (cost < dp[mask][i]) {
                dp[mask][i] = cost;
                parent[mask][i] = j;
              }
            }
          }
        }
      }
    }

    const minPathDist = Array(numSubsets).fill(Infinity);
    const bestEndNode = Array(numSubsets).fill(-1);
    const subsetValue = Array(numSubsets).fill(0);

    for (let mask = 0; mask < numSubsets; mask++) {
      if (mask === 0) { minPathDist[mask] = 0; continue; }
      let maxVal = 0;
      for (let i = 1; i <= N; i++) {
        if ((mask & (1 << (i - 1))) !== 0) {
          maxVal += nodes[i].val;
          const costToReturn = dp[mask][i] + dist[i][0];
          if (costToReturn < minPathDist[mask]) {
            minPathDist[mask] = costToReturn;
            bestEndNode[mask] = i;
          }
        }
      }
      subsetValue[mask] = maxVal;
    }

    let bestTotalVal = -1, bestTotalDist = Infinity, bestMask1 = 0, bestMask2 = 0;

    for (let m1 = 0; m1 < numSubsets; m1++) {
      if (minPathDist[m1] > maxFuel) continue;
      const complement = (numSubsets - 1) ^ m1;
      let m2 = complement;
      
      while (true) {
        if (minPathDist[m2] <= maxFuel) {
          const totalVal = subsetValue[m1] + subsetValue[m2];
          const totalDist = minPathDist[m1] + minPathDist[m2];
          if (totalVal > bestTotalVal || (totalVal === bestTotalVal && totalDist < bestTotalDist)) {
            bestTotalVal = totalVal; bestTotalDist = totalDist;
            bestMask1 = m1; bestMask2 = m2;
          }
        }
        if (m2 === 0) break;
        m2 = (m2 - 1) & complement;
      }
    }

    const reconstructPath = (mask) => {
      if (mask === 0) return [];
      let currNode = bestEndNode[mask], currMask = mask;
      const pathReversed = [];
      while (currNode !== -1 && currMask !== 0) {
        pathReversed.push(currNode);
        const p = parent[currMask][currNode];
        currMask = currMask ^ (1 << (currNode - 1));
        currNode = p;
      }
      return pathReversed.reverse();
    };

    setUavPaths({
      uav1: { path: reconstructPath(bestMask1), dist: minPathDist[bestMask1], val: subsetValue[bestMask1] },
      uav2: { path: reconstructPath(bestMask2), dist: minPathDist[bestMask2], val: subsetValue[bestMask2] }
    });
    setMilpTime(performance.now() - t0);
  };

  const shortenLine = (p1, p2, r1, r2) => {
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.hypot(dx, dy);
    if (dist === 0) return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    return { x1: p1.x + (dx / dist) * r1, y1: p1.y + (dy / dist) * r1, x2: p2.x - (dx / dist) * r2, y2: p2.y - (dy / dist) * r2 };
  };

  const renderPaths = (pathData1, pathData2, isInteractive = false, opacity = 0.9, dashed = false) => {
    const nodes = [{ x: 250, y: 250 }, ...targets];
    const getRadius = (idx) => idx === 0 ? 18 : 16;

    const drawSegmentedLine = (pathIndices, color, markerId) => {
      if (!pathIndices || pathIndices.length === 0) return null;
      const sequence = [0, ...pathIndices, 0];
      const lines = [];
      for (let i = 0; i < sequence.length - 1; i++) {
        const p1 = nodes[sequence[i]];
        const p2 = nodes[sequence[i + 1]];
        const r1 = getRadius(sequence[i]) + 2;
        const r2 = getRadius(sequence[i + 1]) + (isInteractive && i === sequence.length - 2 ? 2 : 10); 
        const { x1, y1, x2, y2 } = shortenLine(p1, p2, r1, r2);
        
        let dashStyle = "none";
        if (dashed) dashStyle = "8,8";
        else if (i === sequence.length - 2) dashStyle = "6,6";

        lines.push(
          <line
            key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth={dashed ? "5" : "3.5"} strokeLinecap="round"
            markerEnd={i === sequence.length - 2 && isInteractive ? "" : `url(#${markerId})`} 
            strokeDasharray={dashStyle} opacity={opacity}
          />
        );
      }
      return <g>{lines}</g>;
    };
    return (
      <g>
        {drawSegmentedLine(pathData1, "#22c55e", dashed ? "arrow-green-ai" : "arrow-green")}
        {drawSegmentedLine(pathData2, "#a855f7", dashed ? "arrow-purple-ai" : "arrow-purple")}
      </g>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 font-sans">
      {/* GitHub 업로드 시, `find_the_apex.mp3` 파일을 
        public 폴더에 넣고 아래 경로가 작동하도록 합니다.
      */}
      <audio ref={audioRef} loop src="/find_the_apex.mp3" preload="auto" />

      {/* 상단 탭 네비게이션 */}
      <div className="bg-white shadow-sm border-b border-slate-200 px-4 md:px-8 py-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar">
          <button onClick={() => setActiveTab('simulator')} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${activeTab === 'simulator' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🚀 AI 자동 시뮬레이터</button>
          <button onClick={() => setActiveTab('theory')} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${activeTab === 'theory' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>📖 비밀 노트: 한계 극복</button>
          <button onClick={() => setActiveTab('algorithm')} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-bold transition-all ${activeTab === 'algorithm' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>💻 해커의 방 (알고리즘)</button>
          <button onClick={() => { setActiveTab('experience'); resetHumanGame(); }} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-bold transition-all flex items-center gap-1 ${activeTab === 'experience' ? 'bg-rose-500 text-white shadow-md shadow-rose-200' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}>🎮 인간 vs AI 대결</button>
        </div>
        <button onClick={toggleBGM} className={`flex-shrink-0 ml-4 p-2 rounded-full transition-all shadow-inner ${isPlaying ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`} title="배경음악 켜기/끄기">
          {isPlaying ? '🔊 BGM ON' : '🔈 BGM OFF'}
        </button>
      </div>

      {/* 🚀 탭 1: AI 자동 시뮬레이터 */}
      {activeTab === 'simulator' && (
        <div className="flex flex-col lg:flex-row flex-1">
          <div className="w-full lg:w-[440px] lg:h-[calc(100vh-64px)] lg:sticky lg:top-[64px] bg-white p-5 md:p-7 shadow-xl flex flex-col gap-6 lg:overflow-y-auto z-10 border-r border-slate-200">
            <div>
              <div className="inline-block bg-blue-100 text-blue-600 font-bold px-3 py-1 rounded-full text-[11px] mb-2 tracking-wider">AUTO MODE</div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">AI 드론 편대 지휘관</h1>
              <p className="text-[13px] font-bold text-slate-500 mt-2 leading-relaxed">
                표적 개수와 드론의 연료를 마음대로 조절해 보세요. AI가 수만 가지 경우의 수를 계산해 가장 완벽한 경로를 찾아냅니다.
              </p>
            </div>
            
            <div className="space-y-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
              <div className="space-y-2">
                <div className="flex justify-between items-end"><label className="text-sm font-bold text-slate-700">전술 표적 개수</label><span className="text-base font-black text-blue-600">{nodeCount}개</span></div>
                <input type="range" min="5" max="11" value={nodeCount} onChange={(e) => setNodeCount(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-end"><label className="text-sm font-bold text-slate-700">무인기 연료 (최대 비행거리)</label><span className="text-base font-black text-blue-600">{maxFuel}</span></div>
                <input type="range" min="300" max="1500" step="50" value={maxFuel} onChange={(e) => setMaxFuel(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
              </div>
              <div className="flex gap-2">
                <button onClick={generateTargets} className="flex-1 bg-white hover:bg-slate-100 text-slate-700 py-3.5 rounded-xl text-[14px] font-bold transition-all border border-slate-200 active:scale-95 shadow-sm">맵 재생성 🔄</button>
                <button onClick={handleSolve} disabled={isSolving} className={`flex-1 py-3.5 rounded-xl text-[14px] font-bold transition-all shadow-md active:scale-95 ${isSolving ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                  {isSolving ? 'AI 연산 중...' : 'AI 최적화 실행 🚀'}
                </button>
              </div>
            </div>

            <div className="pt-2 flex-1">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>AI 지휘 할당 결과</h3>
              {!uavPaths ? (
                <div className="h-32 flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                  <span className="text-2xl mb-2">🤖</span><span className="font-medium">AI 최적화 실행 버튼을 눌러주세요!</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <div className="font-bold text-emerald-900 flex items-center gap-2 text-[15px]"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300"></div>알파 편대</div>
                      <span className="bg-emerald-200 text-emerald-900 font-bold px-3 py-1.5 rounded-lg text-[13px] shadow-sm">가치: ${uavPaths.uav1.val}</span>
                    </div>
                    <div className="text-[13px] text-emerald-800 flex justify-between items-center bg-emerald-100/50 px-3 py-2 rounded-lg">
                      <span className="font-medium">소모 연료</span><span className="font-mono font-bold text-emerald-900">{uavPaths.uav1.dist.toFixed(1)} <span className="text-emerald-700/60 font-medium">/ {maxFuel}</span></span>
                    </div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <div className="font-bold text-purple-900 flex items-center gap-2 text-[15px]"><div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm shadow-purple-300"></div>브라보 편대</div>
                      <span className="bg-purple-200 text-purple-900 font-bold px-3 py-1.5 rounded-lg text-[13px] shadow-sm">가치: ${uavPaths.uav2.val}</span>
                    </div>
                    <div className="text-[13px] text-purple-800 flex justify-between items-center bg-purple-100/50 px-3 py-2 rounded-lg">
                      <span className="font-medium">소모 연료</span><span className="font-mono font-bold text-purple-900">{uavPaths.uav2.dist.toFixed(1)} <span className="text-purple-700/60 font-medium">/ {maxFuel}</span></span>
                    </div>
                  </div>
                  <div className="bg-slate-800 text-white p-5 rounded-2xl text-center shadow-xl mt-4 border border-slate-700">
                    <span className="text-slate-400 text-[13px] font-bold tracking-wider">AI가 확보한 총 전술 가치</span>
                    <div className="text-5xl font-black mt-2 text-white">${uavPaths.uav1.val + uavPaths.uav2.val}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-[500px] lg:min-h-[calc(100vh-64px)] p-4 sm:p-8 flex items-center justify-center bg-slate-900 relative overflow-hidden">
            <div className="absolute w-[900px] h-[900px] border border-blue-500/10 rounded-full animate-[spin_60s_linear_infinite] pointer-events-none"></div>
            <div className="relative w-full max-w-[650px] aspect-square bg-[#070d1f] rounded-[2rem] overflow-hidden shadow-2xl border border-blue-900/50 ring-4 ring-slate-900/80">
              <svg width="100%" height="100%" viewBox="0 0 500 500" className="absolute inset-0">
                <defs>
                  <pattern id="radar-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e3a8a" strokeOpacity="0.3" strokeWidth="1"/></pattern>
                  <marker id="arrow-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#22c55e" /></marker>
                  <marker id="arrow-purple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#a855f7" /></marker>
                </defs>
                <rect width="100%" height="100%" fill="url(#radar-grid)" />
                <circle cx="250" cy="250" r={maxFuel / 2} fill="none" stroke="#38bdf8" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="6,6" />
                {uavPaths && renderPaths(uavPaths.uav1.path, uavPaths.uav2.path, false, 0.9, false)}
                {targets.map((t, i) => (
                  <g key={`target-${i}`} className="transition-all duration-300">
                    <circle cx={t.x} cy={t.y} r="16" fill="#1e293b" stroke="#ef4444" strokeWidth="2.5" />
                    <circle cx={t.x} cy={t.y} r="4" fill="#ef4444" />
                    <text x={t.x} y={t.y - 24} fill="#fca5a5" fontSize="13" fontWeight="900" textAnchor="middle">T{i + 1}</text>
                    <rect x={t.x - 16} y={t.y + 16} width="32" height="16" rx="4" fill="#ef4444" opacity="0.95"/>
                    <text x={t.x} y={t.y + 27} fill="white" fontSize="11" fontWeight="black" textAnchor="middle">${t.val}</text>
                  </g>
                ))}
                <g>
                  <circle cx="250" cy="250" r="22" fill="#0f172a" stroke="#3b82f6" strokeWidth="3.5" />
                  <polygon points="250,234 262,258 238,258" fill="#3b82f6" />
                  <text x="250" y="288" fill="#93c5fd" fontSize="14" fontWeight="black" textAnchor="middle" letterSpacing="2">BASE</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 📖 탭 2: 이론 및 한계 극복 (대회 준비생 맞춤) */}
      {activeTab === 'theory' && (
        <div className="flex-1 p-6 md:p-12 max-w-5xl mx-auto w-full">
          <div className="mb-8">
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 mb-4">비밀 노트: 드론 편대 비행, 왜 어려울까?</h2>
            <p className="text-lg text-slate-600 font-medium">정보올림피아드(KOI)에 자주 나오는 수학계의 대표적인 난제 두 가지가 숨어 있어요!</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white rounded-2xl p-8 shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4"><div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">1</div><h3 className="text-xl font-bold text-slate-800">외판원 문제 (모두 다 가야해!)</h3></div>
              <p className="text-slate-600 mb-6 leading-relaxed">모든 도시(표적)를 정확히 한 번씩 방문하고 돌아오는 <b>가장 짧은 경로</b>를 찾는 문제입니다. 표적이 늘어날수록 경우의 수가 엄청나게 늘어나서 완전탐색(Brute-force)으로는 평생 풀어도 모자라요!</p>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 mb-4">
                <h4 className="text-sm font-bold text-rose-600 mb-2">🚨 드론의 치명적 약점</h4>
                <p className="text-sm text-slate-700">이 문제는 "무조건 다 방문한다"는 룰이 있어요. 하지만 우리 드론은 <b>연료가 부족</b>해서 무리하게 돌다간 추락하고 말아요!</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-md border border-slate-200 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4"><div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-2xl font-bold">2</div><h3 className="text-xl font-bold text-slate-800">배낭 문제 (비싼 것만 챙겨!)</h3></div>
              <p className="text-slate-600 mb-6 leading-relaxed">가방(연료량)에 담을 수 있는 무게가 정해져 있을 때, <b>가치의 합이 최대가 되도록</b> 물건(표적)을 고르는 문제입니다. 역시 알고리즘 대회 단골 문제죠!</p>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 mb-4">
                <h4 className="text-sm font-bold text-rose-600 mb-2">🚨 드론의 치명적 약점</h4>
                <p className="text-sm text-slate-700">비싼 표적만 고르다 보면 동서남북으로 경로가 꼬여서 <b>이동 거리가 엄청나게 길어지는</b> 대참사가 발생할 수 있어요.</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="inline-block bg-blue-500/20 border border-blue-400/30 text-blue-300 font-bold px-4 py-1.5 rounded-full text-sm mb-6">💡 궁극의 마법 공식</div>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-6">최강의 AI 두뇌: MILP (혼합 정수 선형 계획법)</h2>
              <p className="text-slate-300 text-lg leading-relaxed mb-8 max-w-3xl">
                수학자들과 컴퓨터 공학자들은 이 두 가지 난제를 따로 풀지 않습니다. 복잡한 제약들을 <b>0과 1의 수학 기호(방정식)</b>로 바꿔서 완벽한 정답(최적해)을 찾는 마법을 부립니다.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white/10 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
                  <div className="text-blue-400 text-2xl mb-3">🎯</div><h4 className="text-white font-bold text-lg mb-2">목표(Objective) 설정</h4>
                  <p className="text-slate-400 text-[13px]">"가장 높은 가치를 얻어라! 단, 점수가 같다면 거리가 가장 짧은 길을 선택하라!"</p>
                </div>
                <div className="bg-white/10 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
                  <div className="text-emerald-400 text-2xl mb-3">🔗</div><h4 className="text-white font-bold text-lg mb-2">조건(Constraint) 결합</h4>
                  <p className="text-slate-400 text-[13px]">드론 간의 겹치지 않는 동선, 한계 연료 등을 하나의 방정식으로 완벽하게 묶어냅니다.</p>
                </div>
                <div className="bg-white/10 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
                  <div className="text-purple-400 text-2xl mb-3">⚡</div><h4 className="text-white font-bold text-lg mb-2">글로벌 최적해 보장</h4>
                  <p className="text-slate-400 text-[13px]">대충 찍어 맞추는게(휴리스틱) 아니라, 수학적으로 반박 불가한 100% 진짜 정답을 보장해요!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 💻 탭 3: 알고리즘 (코딩 대회용 DP & 비트마스킹 설명) */}
      {activeTab === 'algorithm' && (
        <div className="flex-1 bg-white p-6 md:p-12">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <div className="inline-block bg-slate-800 text-white font-bold px-3 py-1 rounded-md text-[11px] mb-3 tracking-wider">LEVEL UP FOR CODING CONTEST</div>
              <h2 className="text-3xl md:text-4xl font-black text-slate-800 mb-3">해커의 방: 알고리즘 해부하기</h2>
              <p className="text-lg text-slate-600 font-medium">실제 MILP는 슈퍼컴퓨터가 필요하지만, 우리는 코딩의 마술 <b>'동적 계획법(DP)'</b>과 <b>'비트마스킹'</b>으로 0.1초 만에 뚫어냅니다!</p>
            </div>

            <div className="bg-[#1e1e1e] rounded-2xl p-6 shadow-xl mb-12 overflow-x-auto border border-slate-700 relative">
              <div className="absolute top-4 right-4 text-slate-600 text-xs">JavaScript</div>
              <div className="flex gap-2 mb-4"><div className="w-3 h-3 rounded-full bg-red-500"></div><div className="w-3 h-3 rounded-full bg-yellow-500"></div><div className="w-3 h-3 rounded-full bg-green-500"></div><span className="text-slate-400 text-xs ml-2 font-mono">dp_bitmask_solver.js</span></div>
              <pre className="text-[13px] font-mono text-slate-300 leading-relaxed">
<span className="text-slate-500">/* 🚀 Step 1. 거리 행렬 메모이제이션 (Caching) */</span>
<span className="text-blue-400">const</span> dist = <span className="text-yellow-200">calculateDistanceMatrix</span>(Base, targets);

<span className="text-slate-500">/* 🚀 Step 2. 외판원 문제(TSP) 부수기 - 비트마스킹을 활용한 DP */</span>
<span className="text-blue-400">for</span> (<span className="text-blue-400">let</span> mask = 1; mask &lt; (1 &lt;&lt; N); mask++) {'{'}
  <span className="text-blue-400">for</span> (every node <span className="text-purple-300">i</span> in mask) {'{'}
    dp[mask][i] = <span className="text-yellow-200">min</span>(dp[mask - i][j] + dist[j][i]); 
  {'}'}
  minPathDist[mask] = 최단 경로 + Base 복귀 거리;
  subsetValue[mask] = 부분집합(mask)의 가치 총합;
{'}'}

<span className="text-slate-500">/* 🚀 Step 3. 배낭 문제(Knapsack) 분배 - 알파와 브라보에게 미션 할당 */</span>
<span className="text-blue-400">let</span> bestVal = 0, bestDist = <span className="text-purple-300">Infinity</span>;

<span className="text-blue-400">for</span> (조합 <span className="text-purple-300">UAV1</span> in <span className="text-blue-200">all_subsets</span>) {'{'}
  <span className="text-blue-400">if</span> (minPathDist[UAV1] &gt; maxFuel) <span className="text-red-400">continue</span>; <span className="text-slate-500">// 연료 제한 필터링!</span>

  <span className="text-slate-500">  // UAV1과 절대 겹치지 않는 부분집합만 탐색 (교집합 금지)</span>
  <span className="text-blue-400">for</span> (조합 <span className="text-purple-300">UAV2</span> in (UAV1 ^ Complement)) {'{'}
    <span className="text-blue-400">if</span> (minPathDist[UAV2] &gt; maxFuel) <span className="text-red-400">continue</span>;

    <span className="text-blue-400">let</span> totalVal = subsetValue[UAV1] + subsetValue[UAV2];
    <span className="text-blue-400">let</span> totalDist = minPathDist[UAV1] + minPathDist[UAV2];

    <span className="text-slate-500">    /* 🌟 다중 목적 최적화 로직 
       1순위: 무조건 가치가 높은 것!
       2순위: 가치가 같다면? 드론 이동 거리가 제일 짧은 것! */</span>
    <span className="text-blue-400">if</span> (totalVal &gt; bestVal || (totalVal === bestVal && totalDist &lt; bestDist)) {'{'}
      bestVal = totalVal; bestDist = totalDist;
      <span className="text-yellow-200">saveWinner</span>(UAV1, UAV2);
    {'}'}
  {'}'}
{'}'}
              </pre>
            </div>

            <div className="space-y-6">
              <div className="flex gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="flex-shrink-0 w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-black shadow-sm">1</div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">모든 거리를 미리 재기 (거리 행렬)</h3>
                  <p className="text-slate-600 leading-relaxed text-sm">드론이 움직일 때마다 거리를 다시 계산하면 너무 느려져요! 그래서 작전 시작 전, 모든 점 사이의 거리를 계산해서 표(Matrix)에 캐싱해 둡니다.</p>
                </div>
              </div>
              <div className="flex gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="flex-shrink-0 w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-black shadow-sm">2</div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">동적 계획법 (Dynamic Programming)</h3>
                  <p className="text-slate-600 leading-relaxed text-sm">어제 푼 수학 문제를 오늘 또 푼다면 바보겠죠? <b>"한 번 푼 문제는 메모장에 적어두자!"</b>가 DP의 핵심입니다. 이미 구한 짧은 경로를 메모해두고 재활용하여 연산 속도를 빛의 속도로 만듭니다.</p>
                </div>
              </div>
              <div className="flex gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <div className="flex-shrink-0 w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-black shadow-sm">3</div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">비트마스킹 (Bitmasking) 마법</h3>
                  <p className="text-slate-600 leading-relaxed text-sm">배열을 쓰지 않고 <b>숫자 1과 0만으로 (예: 1011 = 1번, 3번 방문)</b> 방문 상태를 기록하는 코딩 스킬이에요. 메모리도 아끼고 속도도 빨라서 올림피아드 필수 스킬이랍니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🎮 탭 4: 인간 vs MILP 대결 (HUD 내장 체험 모드) */}
      {activeTab === 'experience' && (
        <div className="flex flex-col lg:flex-row flex-1 bg-slate-900">
          
          <div className="w-full lg:w-[380px] lg:h-[calc(100vh-64px)] lg:sticky lg:top-[64px] bg-slate-900 border-r border-slate-700/50 flex flex-col z-10 shadow-2xl">
            <div className="p-6 md:p-8 flex flex-col h-full overflow-y-auto">
              {!showReport ? (
                <>
                  <div className="mb-8">
                    <div className="inline-block bg-rose-500/20 text-rose-400 font-bold px-3 py-1 rounded-full text-[11px] mb-2 tracking-wider border border-rose-500/30">CHALLENGE MODE</div>
                    <h1 className="text-2xl font-black text-white tracking-tight leading-tight">지휘관, 작전을 하달하십시오.</h1>
                    <p className="text-[13px] text-slate-400 mt-3 leading-relaxed">
                      우측 지도 <b>상단(알파) / 하단(브라보)</b> 패널을 눌러 편대를 선택하고 표적을 터치하여 경로를 완성하세요.
                    </p>
                  </div>

                  <div className="bg-[#1e2336] p-5 rounded-2xl border border-slate-700/50 mb-6 flex flex-col gap-2 shadow-inner">
                    <span className="text-sm font-bold text-slate-400">레이더 상의 미할당 표적</span>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-black text-rose-400">{targets.length - humanPaths.uav1.length - humanPaths.uav2.length}</span>
                      <span className="text-sm text-slate-500 font-medium mb-1">개 남음</span>
                    </div>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 text-blue-300 text-xs leading-relaxed space-y-2 mt-auto">
                    <p>💡 <b>작전 팁:</b> 연료(거리)가 허용하는 한 높은 $가치 표적들을 선점하십시오.</p>
                    <p>💡 <b>수정:</b> 마지막으로 선택한 표적을 탭하면 연결이 취소됩니다.</p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center fade-in">
                  <div className="text-6xl mb-6 drop-shadow-lg">MISSION<br/>COMPLETE</div>
                  <h2 className="text-2xl font-black text-white mb-3">작전 종료</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">우측 레이더 화면에<br/>분석 리포트가 수신되었습니다.</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#0a101f] relative">
            <div className="w-full max-w-[650px] flex flex-col gap-4 relative h-full max-h-[850px] justify-center">
              
              {fuelWarning && (
                <div className="absolute top-[80px] left-1/2 -translate-x-1/2 z-50 bg-rose-500/90 text-white text-[13px] font-bold px-6 py-3 rounded-full shadow-[0_5px_20px_rgba(225,29,72,0.6)] backdrop-blur-sm animate-bounce whitespace-nowrap">
                  {fuelWarning}
                </div>
              )}

              {/* 상단 패널 - Alpha */}
              {isReviewMode ? (
                <button onClick={generateTargets} className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl transition-all border-2 text-left bg-blue-900/40 border-blue-500/50 hover:bg-blue-800/60 shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse-slow z-20">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black tracking-widest text-blue-300 mb-1">ALPHA 편대 작전 리뷰 중</span>
                    <span className="text-lg sm:text-xl font-black text-white">🚀 새로운 작전 배정받기</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 mb-1">나의 가치 <span className="text-slate-600">vs</span> AI 가치</span>
                    <span className="font-mono text-sm sm:text-base font-bold text-white">
                      <span className={calculatePathMetrics(humanPaths.uav1).val >= (uavPaths?.uav1.val||0) ? "text-emerald-400" : "text-rose-400"}>${calculatePathMetrics(humanPaths.uav1).val}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-blue-400">${uavPaths ? uavPaths.uav1.val : 0}</span>
                    </span>
                  </div>
                </button>
              ) : (
                <button 
                  onClick={() => !showReport && setActiveUAV('uav1')}
                  className={`w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl transition-all border-2 text-left group z-20
                  ${showReport ? 'opacity-30 pointer-events-none' : ''}
                  ${activeUAV === 'uav1' && !showReport ? 'bg-emerald-950/80 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)]' : 'bg-slate-800/80 border-slate-700 hover:border-emerald-700 opacity-80'}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-[11px] sm:text-xs font-black tracking-widest mb-1 ${activeUAV === 'uav1' && !showReport ? 'text-emerald-400' : 'text-slate-400'}`}>ALPHA (상단 편대)</span>
                    <span className={`text-xl sm:text-2xl font-black ${activeUAV === 'uav1' && !showReport ? 'text-white' : 'text-slate-300'}`}>${calculatePathMetrics(humanPaths.uav1).val}</span>
                  </div>
                  <div className="w-1/2 flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 mb-1">소모 연료</span>
                    <span className={`font-mono text-sm sm:text-base font-bold ${activeUAV === 'uav1' && !showReport ? 'text-emerald-300' : 'text-slate-400'} mb-1.5`}>{calculatePathMetrics(humanPaths.uav1).dist.toFixed(0)} / {maxFuel}</span>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 sm:h-2">
                      <div className={`h-full rounded-full transition-all duration-300 ${activeUAV === 'uav1' && !showReport ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, (calculatePathMetrics(humanPaths.uav1).dist / maxFuel) * 100)}%` }}></div>
                    </div>
                  </div>
                </button>
              )}

              {/* 🎯 중앙 레이더 캔버스 */}
              <div className="relative w-full aspect-square bg-[#030612] rounded-[2rem] shadow-2xl border border-slate-700/80 ring-4 ring-slate-950 overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 500 500" className="absolute inset-0">
                  <defs>
                    <pattern id="radar-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e3a8a" strokeOpacity="0.2" strokeWidth="1"/></pattern>
                    <marker id="arrow-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#22c55e" /></marker>
                    <marker id="arrow-purple" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#a855f7" /></marker>
                    <marker id="arrow-green-ai" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#22c55e" /></marker>
                    <marker id="arrow-purple-ai" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 2 L 8 5 L 0 8 z" fill="#a855f7" /></marker>
                  </defs>
                  
                  <rect width="100%" height="100%" fill="url(#radar-grid)" />
                  <circle cx="250" cy="250" r={maxFuel / 2} fill="none" stroke="#38bdf8" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="4,4" />
                  
                  {isReviewMode && uavPaths && (
                    <g opacity="0.8">
                      {renderPaths(uavPaths.uav1.path, uavPaths.uav2.path, false, 0.9, true)}
                    </g>
                  )}

                  {renderPaths(humanPaths.uav1, humanPaths.uav2, !showReport && !isReviewMode, showReport ? 0.3 : (isReviewMode ? 0.4 : 1))}
                  
                  {targets.map((t, i) => {
                    const tIdx = i + 1;
                    const inUav1 = humanPaths.uav1.includes(tIdx);
                    const inUav2 = humanPaths.uav2.includes(tIdx);
                    const isSelected = inUav1 || inUav2;
                    
                    const uav1Order = humanPaths.uav1.indexOf(tIdx) + 1;
                    const uav2Order = humanPaths.uav2.indexOf(tIdx) + 1;
                    const orderNum = uav1Order > 0 ? uav1Order : (uav2Order > 0 ? uav2Order : null);
                    
                    let fillColor = "#0f172a"; 
                    let strokeColor = "#ef4444";
                    if (inUav1) { fillColor = "#dcfce7"; strokeColor = "#22c55e"; }
                    if (inUav2) { fillColor = "#f3e8ff"; strokeColor = "#a855f7"; }

                    const dimFactor = showReport && !isSelected ? 0.2 : 1;
                    const dimFactor2 = showReport && isSelected ? 0.4 : 1; 

                    return (
                      <g 
                        key={`target-${i}`} 
                        className={`transition-all duration-200 ${(!showReport && !isReviewMode) ? 'cursor-pointer hover:scale-[1.12]' : ''}`}
                        onClick={() => handleTargetClick(i)}
                        opacity={showReport ? dimFactor2 : 1}
                      >
                        <circle cx={t.x} cy={t.y} r="25" fill="transparent" />
                        <circle cx={t.x} cy={t.y} r="14" fill={fillColor} stroke={strokeColor} strokeWidth="3" opacity={dimFactor} />
                        <circle cx={t.x} cy={t.y} r="4" fill={strokeColor} opacity={dimFactor} />
                        <text x={t.x} y={t.y - 21} fill={isSelected ? strokeColor : "#fca5a5"} fontSize="12" fontWeight="900" textAnchor="middle" opacity={dimFactor}>T{tIdx}</text>
                        <rect x={t.x - 14} y={t.y + 16} width="28" height="14" rx="3" fill={strokeColor} opacity={dimFactor}/>
                        <text x={t.x} y={t.y + 26} fill={inUav1 || inUav2 ? "#000" : "white"} fontSize="10" fontWeight="900" textAnchor="middle" opacity={dimFactor}>${t.val}</text>
                        
                        {/* 방문 순서(넘버링) 뱃지 */}
                        {orderNum && !showReport && (
                          <g transform={`translate(${t.x + 12}, ${t.y - 12})`}>
                            <circle r="8" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
                            <text y="3" fill={strokeColor} fontSize="10" fontWeight="900" textAnchor="middle">{orderNum}</text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                  
                  <g opacity={showReport ? 0.4 : 1}>
                    <circle cx="250" cy="250" r="20" fill="#020617" stroke="#3b82f6" strokeWidth="4" />
                    <polygon points="250,235 260,256 240,256" fill="#3b82f6" />
                    <text x="250" y="284" fill="#93c5fd" fontSize="13" fontWeight="900" textAnchor="middle" letterSpacing="1.5">BASE</text>
                  </g>
                </svg>

                {/* 캔버스 내부 조작 플로팅 버튼 */}
                {!showReport && !isReviewMode && (
                  <>
                    <button 
                      onClick={resetHumanGame} 
                      className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 z-30 bg-slate-800/90 hover:bg-slate-700 text-slate-300 font-bold text-[13px] px-5 py-3.5 rounded-full shadow-lg border border-slate-600 active:scale-95 transition-all flex items-center gap-1.5 backdrop-blur-sm"
                    >
                      <span>🔄</span> 초기화
                    </button>
                    <button 
                      onClick={submitHumanSolution} 
                      className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30 bg-rose-600/95 hover:bg-rose-500 text-white font-black text-sm px-7 py-3.5 rounded-full shadow-[0_0_20px_rgba(225,29,72,0.6)] active:scale-95 transition-all flex items-center gap-2 backdrop-blur-sm"
                    >
                      결과 제출 <span>🚀</span>
                    </button>
                  </>
                )}

                {/* 🌟 캔버스 중앙 리포트 HUD 팝업 */}
                {showReport && !hideReportModal && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#030612]/75 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-[#1e2336] border border-slate-700 w-full max-w-sm max-h-[90%] overflow-y-auto rounded-[1.5rem] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col gap-4">
                      <div className="text-center mb-1"><h2 className="text-xl font-black text-white">작전 분석 리포트</h2></div>
                      <div className="bg-[#2a3047] rounded-xl p-5 border border-[#3b4261] shadow-inner">
                        <h3 className="text-slate-300 text-[13px] font-bold mb-4 flex items-center gap-2">🏆 총 획득 전술 가치</h3>
                        <div className="flex justify-between items-end mb-4 pb-4 border-b border-slate-600/50">
                          <div>
                            <div className="text-rose-400 text-[11px] font-bold mb-1">인간 지휘관 (당신)</div>
                            <div className="text-4xl font-black text-white">{calculatePathMetrics(humanPaths.uav1).val + calculatePathMetrics(humanPaths.uav2).val}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-blue-400 text-[11px] font-bold mb-1">최강 AI (MILP)</div>
                            <div className="text-4xl font-black text-blue-400">{uavPaths ? uavPaths.uav1.val + uavPaths.uav2.val : 0}</div>
                          </div>
                        </div>
                        {(() => {
                          const humanVal = calculatePathMetrics(humanPaths.uav1).val + calculatePathMetrics(humanPaths.uav2).val;
                          const aiVal = uavPaths ? uavPaths.uav1.val + uavPaths.uav2.val : 0;
                          if (humanVal === aiVal) return <div className="bg-emerald-900/40 text-emerald-400 text-xs font-bold text-center py-2.5 rounded-lg border border-emerald-800/50">천재적인 두뇌! AI와 똑같은 최고 점수입니다.</div>;
                          return <div className="bg-rose-900/20 text-rose-400 text-xs font-bold text-center py-2.5 rounded-lg border border-rose-800/30">AI가 당신보다 ${aiVal - humanVal} 더 높은 가치를 찾았습니다.</div>;
                        })()}
                      </div>

                      <div className="bg-[#2a3047] rounded-xl p-5 border border-[#3b4261] shadow-inner">
                        <h3 className="text-slate-300 text-[13px] font-bold mb-4 flex items-center gap-2">⏱️ 작전 수립 소요 시간</h3>
                        <div className="flex justify-between items-center mb-3"><span className="text-rose-300 text-[13px] font-bold">인간 지휘관</span><span className="font-mono text-white text-lg font-bold">{(humanTime.elapsed / 1000).toFixed(2)} 초</span></div>
                        <div className="flex justify-between items-center pt-3 border-t border-slate-600/50"><span className="text-blue-300 text-[13px] font-bold">MILP 알고리즘</span><span className="font-mono text-blue-400 text-lg font-bold">{(milpTime / 1000).toFixed(4)} 초</span></div>
                      </div>

                      {/* 3초 카운트다운 로직 */}
                      <div className="mt-1 flex flex-col gap-2">
                        <button onClick={() => { setHideReportModal(true); setIsReviewMode(true); }} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-[13px] rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all active:scale-95">
                          AI 최적 동선 오버레이 비교 🔍
                        </button>
                        <div className="text-center text-blue-300/80 text-[11px] font-bold animate-pulse">
                          {countdown > 0 ? `${countdown}초 후 AI의 정답이 자동으로 공개됩니다...` : 'AI 정답 불러오는 중...'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 🎯 리뷰 모드 캔버스 컨트롤 */}
                {isReviewMode && (
                  <button 
                    onClick={() => { setShowReport(true); setHideReportModal(false); setIsReviewMode(false); }} 
                    className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs px-5 py-3.5 rounded-full border border-slate-600 shadow-lg backdrop-blur-sm transition-all flex items-center gap-2 active:scale-95"
                  >
                    📊 성적표 다시 보기
                  </button>
                )}
                {isReviewMode && (
                  <div className="absolute top-4 sm:top-6 left-4 sm:left-6 z-40 bg-slate-900/85 text-blue-300 font-bold text-[11px] px-3.5 py-2.5 rounded-xl border border-blue-900/80 shadow-lg backdrop-blur-sm flex flex-col gap-1.5">
                    <div className="flex items-center gap-2"><span className="w-5 h-0.5 bg-white opacity-40"></span> <span>반투명 실선: 나의 동선</span></div>
                    <div className="flex items-center gap-2"><span className="w-5 border-b-2 border-dotted border-blue-400"></span> <span>두꺼운 점선: AI 최적 정답</span></div>
                  </div>
                )}
              </div>

              {/* 🎯 하단 패널 - Bravo */}
              {isReviewMode ? (
                <button onClick={generateTargets} className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl transition-all border-2 text-left bg-blue-900/40 border-blue-500/50 hover:bg-blue-800/60 shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse-slow z-20">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black tracking-widest text-blue-300 mb-1">BRAVO 편대 작전 리뷰 중</span>
                    <span className="text-lg sm:text-xl font-black text-white">🚀 새로운 작전 배정받기</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 mb-1">나의 가치 <span className="text-slate-600">vs</span> AI 가치</span>
                    <span className="font-mono text-sm sm:text-base font-bold text-white">
                      <span className={calculatePathMetrics(humanPaths.uav2).val >= (uavPaths?.uav2.val||0) ? "text-purple-400" : "text-rose-400"}>${calculatePathMetrics(humanPaths.uav2).val}</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-blue-400">${uavPaths ? uavPaths.uav2.val : 0}</span>
                    </span>
                  </div>
                </button>
              ) : (
                <button 
                  onClick={() => !showReport && setActiveUAV('uav2')}
                  className={`w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl transition-all border-2 text-left group z-20
                  ${showReport ? 'opacity-30 pointer-events-none' : ''}
                  ${activeUAV === 'uav2' && !showReport ? 'bg-purple-950/80 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)]' : 'bg-slate-800/80 border-slate-700 hover:border-purple-700 opacity-80'}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-[11px] sm:text-xs font-black tracking-widest mb-1 ${activeUAV === 'uav2' && !showReport ? 'text-purple-400' : 'text-slate-400'}`}>BRAVO (하단 편대)</span>
                    <span className={`text-xl sm:text-2xl font-black ${activeUAV === 'uav2' && !showReport ? 'text-white' : 'text-slate-300'}`}>${calculatePathMetrics(humanPaths.uav2).val}</span>
                  </div>
                  <div className="w-1/2 flex flex-col items-end">
                    <span className="text-[10px] text-slate-400 mb-1">소모 연료</span>
                    <span className={`font-mono text-sm sm:text-base font-bold ${activeUAV === 'uav2' && !showReport ? 'text-purple-300' : 'text-slate-400'} mb-1.5`}>{calculatePathMetrics(humanPaths.uav2).dist.toFixed(0)} / {maxFuel}</span>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 sm:h-2">
                      <div className={`h-full rounded-full transition-all duration-300 ${activeUAV === 'uav2' && !showReport ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, (calculatePathMetrics(humanPaths.uav2).dist / maxFuel) * 100)}%` }}></div>
                    </div>
                  </div>
                </button>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

