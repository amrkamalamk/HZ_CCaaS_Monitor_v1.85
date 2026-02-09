
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  UnifiedDataPoint, 
  AgentPerformance, 
  WrapUpData, 
  BranchData, 
  CallerData, 
  ReasonBranchData, 
  CustomerConversation, 
  InteractionRecord 
} from './types';
import { 
  MOS_THRESHOLD_DEFAULT, 
  POLLING_INTERVAL_MS,
  QUEUE_NAME_DEFAULT
} from './constants';
import { fetchRealtimeMetrics, getQueueIdByName, fetchRecentInteractions } from './services/genesysService';
import { analyzeMOSPerformance } from './services/geminiService';

// Component imports
import MOSChart from './components/MOSChart';
import AgentPerformanceTable from './components/AgentPerformanceTable';
import UnifiedDashboardChart from './components/UnifiedDashboardChart';
import WrapUpChart from './components/WrapUpChart';
import BranchChart from './components/BranchChart';
import TopCallersChart from './components/TopCallersChart';
import AHTChart from './components/AHTChart';
import AgentsChart from './components/AgentsChart';
import PlannerTab from './components/PlannerTab';
import ReasonsBranchTab from './components/ReasonsBranchTab';
import CustomersTab from './components/CustomersTab';
import RecordingsView from './components/RecordingsView';

type TabType = 'interval' | 'daily';
type SubTabType = 'summary' | 'charts' | 'agents' | 'wrapup' | 'branches' | 'reasonsbranch' | 'topcallers' | 'customers' | 'recordings' | 'planner' | 'aiforensics';

const getRAGColor = (type: 'mos' | 'sl' | 'abandoned', value: number | null, offered?: number) => {
  if (value === null) return 'text-slate-400';
  if (type === 'mos') return value < 4.3 ? 'text-rose-600' : value < 4.7 ? 'text-amber-500' : 'text-emerald-600';
  if (type === 'sl') return value < 80 ? 'text-rose-600' : value < 90 ? 'text-amber-500' : 'text-emerald-600';
  if (type === 'abandoned') { 
    const percent = offered && offered > 0 ? (value / offered) * 100 : 0; 
    return percent > 10 ? 'text-rose-600' : percent > 5 ? 'text-amber-500' : 'text-emerald-600'; 
  }
  return 'text-slate-900';
}

const KPIBox = ({ label, value, icon, color, bg = "bg-white" }: { label: string, value: React.ReactNode, icon: string, color: string, bg?: string }) => (
  <div className={`${bg} p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center transition-all hover:shadow-md`}>
    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 bg-slate-50`}>
      <i className={`fa-solid ${icon} ${color} text-sm`}></i>
    </div>
    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">{label}</p>
    <div className={`text-lg font-black tracking-tight truncate w-full ${color}`}>{value}</div>
  </div>
);

const App: React.FC = () => {
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
  const [unifiedHistory, setUnifiedHistory] = useState<UnifiedDataPoint[]>([]);
  const [agentStats, setAgentStats] = useState<AgentPerformance[]>([]);
  const [wrapUpData, setWrapUpData] = useState<WrapUpData[]>([]);
  const [branchData, setBranchData] = useState<BranchData[]>([]);
  const [reasonBranchData, setReasonBranchData] = useState<ReasonBranchData[]>([]);
  const [topCallers, setTopCallers] = useState<CallerData[]>([]);
  const [customerConversations, setCustomerConversations] = useState<CustomerConversation[]>([]);
  const [recordings, setRecordings] = useState<InteractionRecord[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('interval');
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('summary');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  const [recFromTime, setRecFromTime] = useState("");
  const [recToTime, setRecToTime] = useState("");
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    queueName: QUEUE_NAME_DEFAULT, threshold: MOS_THRESHOLD_DEFAULT,
  });

  const fetchData = useCallback(async () => {
    if (!activeQueueId) return;
    setIsFetching(true);
    try {
      const metrics = await fetchRealtimeMetrics(activeQueueId, selectedDate);
      setUnifiedHistory(metrics.history || []);
      setAgentStats(metrics.agents || []);
      setWrapUpData(metrics.wrapUpData || []);
      setBranchData(metrics.branchData || []);
      setReasonBranchData(metrics.reasonBranchData || []);
      setTopCallers(metrics.topCallers || []);
      setCustomerConversations(metrics.customerConversations || []);
      
      const recs = await fetchRecentInteractions(activeQueueId);
      setRecordings(recs);

      setError(null);
    } catch (err: any) { 
      setError(err.message); 
    } finally { setIsFetching(false); }
  }, [activeQueueId, selectedDate]);

  useEffect(() => {
    if (!activeQueueId) return;
    fetchData();
    const interval = setInterval(fetchData, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeQueueId, fetchData]);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    try {
      const { queueId } = await getQueueIdByName(formData.queueName.trim());
      setActiveQueueId(queueId); 
      setIsConfigOpen(false);
    } catch (err: any) { 
       setError(err.message); 
    }
  };

  const handleRunAiAnalysis = async () => {
    setIsAiAnalyzing(true);
    try {
      const result = await analyzeMOSPerformance(unifiedHistory.map(h => ({
        timestamp: h.timestamp,
        mos: h.mos || 0,
        conversationsCount: h.conversationsCount
      })));
      setAiAnalysisResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const dailyAggregatedHistory = useMemo(() => {
    if (activeTab === 'interval') return unifiedHistory.map(h => ({ ...h, timestamp: h.timestamp.split(' ')[1] || h.timestamp }));
    const days: Record<string, any> = {};
    unifiedHistory.forEach(h => {
      const date = h.timestamp.split(' ')[0];
      if (!days[date]) days[date] = { offered: 0, answered: 0, abandoned: 0, mosSum: 0, mosCount: 0, ahtSum: 0, ahtCount: 0, slMet: 0, agentsMax: 0 };
      const d = days[date];
      d.offered += h.offered; d.answered += h.answered; d.abandoned += h.abandoned; d.agentsMax = Math.max(d.agentsMax, h.agentsCount);
      if (h.mos !== null) { d.mosSum += (h.mos * h.offered); d.mosCount += h.offered; }
      if (h.aht !== null) { d.ahtSum += (h.aht * h.answered); d.ahtCount += h.answered; }
      if (h.slPercent !== null) d.slMet += (h.slPercent * h.offered / 100);
    });
    return Object.keys(days).sort().map(date => ({
      timestamp: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      offered: days[date].offered, answered: days[date].answered, abandoned: days[date].abandoned,
      mos: days[date].mosCount > 0 ? days[date].mosSum / days[date].mosCount : null,
      aht: days[date].ahtCount > 0 ? days[date].ahtSum / days[date].ahtCount : null,
      slPercent: days[date].offered > 0 ? (days[date].slMet / days[date].offered) * 100 : null,
      agentsCount: days[date].agentsMax, conversationsCount: days[date].offered
    }));
  }, [unifiedHistory, activeTab]);

  const metrics = useMemo(() => {
    const totalOffered = dailyAggregatedHistory.reduce((acc, d) => acc + d.offered, 0);
    const totalAnswered = dailyAggregatedHistory.reduce((acc, d) => acc + d.answered, 0);
    const totalAbandoned = dailyAggregatedHistory.reduce((acc, d) => acc + d.abandoned, 0);
    const totalAgents = agentStats.length;
    const totalSlMet = dailyAggregatedHistory.reduce((acc, d) => acc + (d.slPercent !== null ? (d.slPercent * d.offered / 100) : 0), 0);
    const avgSL = totalOffered > 0 ? (totalSlMet / totalOffered) * 100 : 0;
    const mosOffered = dailyAggregatedHistory.reduce((acc, d) => acc + (d.mos !== null ? d.offered : 0), 0);
    const mosWeight = dailyAggregatedHistory.reduce((acc, d) => acc + (d.mos !== null ? d.mos * d.offered : 0), 0);
    const avgMOS = mosOffered > 0 ? (mosWeight / mosOffered) : null;
    const totalHT = dailyAggregatedHistory.reduce((acc, d) => acc + (d.aht !== null ? (d.aht * d.answered) : 0), 0);
    const avgAHT = totalAnswered > 0 ? (totalHT / totalAnswered) : 0;
    const avgCalls = totalAgents > 0 ? totalAnswered / totalAgents : 0;

    const intervals = dailyAggregatedHistory.map(h => ({ mos: h.mos || 0, sl: h.slPercent || 0, offered: h.offered, answered: h.answered, abandoned: h.abandoned, agents: h.agentsCount, aht: h.aht || 0, avgCalls: h.agentsCount > 0 ? h.answered / h.agentsCount : 0 }));
    const max = { 
        mos: intervals.length ? Math.max(...intervals.map(i => i.mos)) : 0, 
        sl: intervals.length ? Math.max(...intervals.map(i => i.sl)) : 0, 
        offered: intervals.length ? Math.max(...intervals.map(i => i.offered)) : 0, 
        answered: intervals.length ? Math.max(...intervals.map(i => i.answered)) : 0, 
        abandoned: intervals.length ? Math.max(...intervals.map(i => i.abandoned)) : 0, 
        agents: intervals.length ? Math.max(...intervals.map(i => i.agents)) : 0, 
        aht: intervals.length ? Math.max(...intervals.map(i => i.aht)) : 0, 
        avgCalls: intervals.length ? Math.max(...intervals.map(i => i.avgCalls)) : 0 
    };
    const minVal = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
    const min = { 
        mos: minVal(intervals.filter(i => i.mos > 0).map(i => i.mos)), 
        sl: minVal(intervals.filter(i => i.sl > 0).map(i => i.sl)), 
        offered: minVal(intervals.map(i => i.offered)), 
        answered: minVal(intervals.map(i => i.answered)), 
        abandoned: minVal(intervals.map(i => i.abandoned)), 
        agents: minVal(intervals.map(i => i.agents)), 
        aht: minVal(intervals.filter(i => i.aht > 0).map(i => i.aht)), 
        avgCalls: minVal(intervals.filter(i => i.avgCalls > 0).map(i => i.avgCalls)) 
    };
    return { summary: { mos: avgMOS, sl: avgSL, offered: totalOffered, answered: totalAnswered, abandoned: totalAbandoned, agents: totalAgents, aht: avgAHT, avgCalls: avgCalls }, max, min: { ...min, mos: isFinite(min.mos) ? min.mos : 0, sl: isFinite(min.sl) ? min.sl : 0, aht: isFinite(min.aht) ? min.aht : 0, avgCalls: isFinite(min.avgCalls) ? min.avgCalls : 0 } };
  }, [dailyAggregatedHistory, agentStats]);

  const renderMetricRow = (label: string, data: any, rowType: 'summary' | 'max' | 'min') => {
    const bgMap = { summary: "bg-white", max: "bg-emerald-50/50", min: "bg-slate-50/50" };
    const abDisplay = (<span className="inline-flex items-baseline gap-1"><span>{data.abandoned}</span><span className="text-[10px] opacity-60">({(data.offered > 0 ? (data.abandoned / data.offered) * 100 : 0).toFixed(1)}%)</span></span>);
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPIBox label={`${rowType === 'summary' ? 'Avg.' : (rowType === 'max' ? 'MAX' : 'MIN')} MOS`} value={data.mos !== null ? data.mos.toFixed(2) : 'N/A'} icon="fa-microphone-lines" color={getRAGColor('mos', data.mos)} bg={bgMap[rowType]} />
        <KPIBox label={`${rowType === 'summary' ? 'Avg.' : (rowType === 'max' ? 'MAX' : 'MIN')} SL%`} value={`${data.sl.toFixed(1)}%`} icon="fa-bolt" color={getRAGColor('sl', data.sl)} bg={bgMap[rowType]} />
        <KPIBox label="Offered" value={data.offered} icon="fa-phone-volume" color="text-slate-900" bg={bgMap[rowType]} />
        <KPIBox label="Answered" value={data.answered} icon="fa-headset" color="text-slate-900" bg={bgMap[rowType]} />
        <KPIBox label="Abandoned" value={abDisplay} icon="fa-phone-slash" color={getRAGColor('abandoned', data.abandoned, data.offered)} bg={bgMap[rowType]} />
        <KPIBox label="Agents" value={data.agents} icon="fa-users" color="text-slate-900" bg={bgMap[rowType]} />
        <KPIBox label="AHT" value={`${data.aht.toFixed(0)}s`} icon="fa-clock" color="text-slate-900" bg={bgMap[rowType]} />
        <KPIBox label="Calls/Agent" value={data.avgCalls.toFixed(1)} icon="fa-calculator" color="text-slate-900" bg={bgMap[rowType]} />
      </div>
    );
  };

  const subTabLabels: Record<SubTabType, string> = { 
    summary: 'Summary', charts: 'Charts', agents: 'Agents', wrapup: 'Call Reasons', branches: 'Branches', reasonsbranch: 'Reasons/Branch', topcallers: 'Top Callers', customers: 'Customers', recordings: 'Recordings', planner: 'Planner', aiforensics: 'AI Forensics' 
  };

  const tabRow1: SubTabType[] = ['summary', 'charts', 'agents', 'wrapup', 'branches', 'reasonsbranch'];
  const tabRow2: SubTabType[] = ['topcallers', 'customers', 'recordings', 'planner', 'aiforensics'];

  const renderTabButton = (st: SubTabType) => {
    const isActive = activeSubTab === st;
    return (
      <button key={st} onClick={() => setActiveSubTab(st)} className={`flex-1 min-w-[120px] px-4 py-3 text-[10px] font-black tracking-wider uppercase transition-all border border-slate-300 rounded-t-xl ${isActive ? 'bg-slate-50 border-b-transparent text-emerald-600 shadow-[0_-2px_4px_rgba(0,0,0,0.03)]' : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700'}`}>
        {subTabLabels[st]}
      </button>
    );
  };

  return (
    <div className={`min-h-screen relative flex flex-col bg-slate-50 text-slate-900 font-['Inter']`}>
      {isFetching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Syncing Mawsool...</p>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-lg">M</div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none">Mawsool</h1>
              <div className="flex flex-col mt-1">
                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest leading-relaxed">Genesys Cloud CX2 (UAE)</p>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-relaxed">Super Chicken Queue</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Baghdad (09:00 - 03:00 +1d)</p>
              </div>
            </div>
          </div>
          {!isConfigOpen && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden md:flex bg-slate-100 p-1 rounded-lg border border-slate-200">{(['interval', 'daily'] as TabType[]).map(t => (<button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === t ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>))}</div>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20" />
              {activeTab === 'daily' && (
                <>
                  <span className="text-slate-300 font-bold">-</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20" />
                </>
              )}
              <button onClick={() => setIsConfigOpen(true)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center"><i className="fa-solid fa-sliders"></i></button>
            </div>
          )}
        </header>

        {!isConfigOpen && (
          <div className="px-6 pt-4 bg-slate-100 border-b border-slate-200">
            <div className="max-w-7xl mx-auto flex flex-col gap-1">
              <div className="flex flex-wrap gap-1">{tabRow1.map(renderTabButton)}</div>
              <div className="flex flex-wrap gap-1">{tabRow2.map(renderTabButton)}</div>
            </div>
          </div>
        )}
      </div>

      <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-8">
        {isConfigOpen ? (
          <div className="max-w-xl mx-auto py-12">
            <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200">
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-2xl shadow-emerald-500/20 mb-4">M</div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Access Terminal</h2>
                <div className="flex flex-col items-center mt-1">
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest leading-relaxed">Genesys Cloud CX2 (UAE)</p>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-relaxed">Super Chicken Queue</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Baghdad (09:00 - 03:00 +1d)</p>
                </div>
              </div>
              <form onSubmit={handleConnect} className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Queue Identity</label>
                  <input type="text" value={formData.queueName} onChange={e => setFormData({...formData, queueName: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                </div>
                <button type="submit" className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-3">
                  <i className="fa-solid fa-plug"></i><span className="uppercase tracking-widest">Connect Mawsool</span>
                </button>
                {error && (<div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-center text-xs font-bold leading-relaxed">{error}</div>)}
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {activeSubTab === 'summary' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><i className="fa-solid fa-chart-line text-emerald-500"></i> Performance Matrix</h3>
                   <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time Feed Active</span></div>
                </div>
                {renderMetricRow('summary', metrics.summary, 'summary')}
                {renderMetricRow('max', metrics.max, 'max')}
                {renderMetricRow('min', metrics.min, 'min')}
              </div>
            )}
            
            {activeSubTab === 'charts' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm md:col-span-2">
                  <h4 className="text-xs font-black uppercase text-slate-900 mb-6 flex items-center gap-2"><i className="fa-solid fa-microphone-lines text-emerald-500"></i> Voice Quality (MOS)</h4>
                  <MOSChart data={dailyAggregatedHistory} threshold={formData.threshold} />
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm md:col-span-2">
                  <h4 className="text-xs font-black uppercase text-slate-900 mb-6 flex items-center gap-2"><i className="fa-solid fa-phone-volume text-emerald-500"></i> Traffic & Service Levels</h4>
                  <div className="h-[400px]"><UnifiedDashboardChart data={dailyAggregatedHistory} /></div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h4 className="text-xs font-black uppercase text-slate-900 mb-6 flex items-center gap-2"><i className="fa-solid fa-clock text-emerald-500"></i> Average Handle Time (AHT)</h4>
                  <AHTChart data={dailyAggregatedHistory} />
                </div>
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h4 className="text-xs font-black uppercase text-slate-900 mb-6 flex items-center gap-2"><i className="fa-solid fa-users text-emerald-500"></i> Active Agents</h4>
                  <AgentsChart data={dailyAggregatedHistory} />
                </div>
              </div>
            )}

            {activeSubTab === 'agents' && <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><AgentPerformanceTable agents={agentStats} /></div>}
            {activeSubTab === 'reasonsbranch' && <ReasonsBranchTab reasonBranchData={reasonBranchData} branchData={branchData} wrapUpData={wrapUpData} />}
            {activeSubTab === 'wrapup' && <div className="h-[600px] bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h4 className="text-xs font-black uppercase text-slate-900 mb-6">Call Reason Analysis</h4><WrapUpChart data={wrapUpData} /></div>}
            {activeSubTab === 'branches' && <div className="h-[600px] bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h4 className="text-xs font-black uppercase text-slate-900 mb-6">Regional Distribution</h4><BranchChart data={branchData} /></div>}
            {activeSubTab === 'topcallers' && <div className="h-[600px] bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"><h4 className="text-xs font-black uppercase text-slate-900 mb-6">Frequent Identity Mapping</h4><TopCallersChart data={topCallers} /></div>}
            {activeSubTab === 'customers' && <CustomersTab conversations={customerConversations} />}
            {activeSubTab === 'recordings' && (
              <RecordingsView 
                recordings={recordings} fromTime={recFromTime} toTime={recToTime} 
                setFromTime={setRecFromTime} setToTime={setRecToTime} onRefresh={fetchData} 
              />
            )}
            {activeSubTab === 'planner' && activeQueueId && <PlannerTab queueId={activeQueueId} />}
            {activeSubTab === 'aiforensics' && (
              <div className="bg-white p-12 rounded-[3rem] border border-slate-200 text-center space-y-8">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                  <i className="fa-solid fa-brain text-3xl"></i>
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase">AI Quality Forensics</h3>
                {aiAnalysisResult ? (
                  <div className="max-w-4xl mx-auto text-left">
                    <div className="whitespace-pre-wrap text-sm text-slate-600 bg-slate-50 p-8 rounded-2xl border border-slate-100 leading-relaxed">{aiAnalysisResult}</div>
                    <button onClick={() => setAiAnalysisResult(null)} className="mt-8 px-8 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase">New Analysis</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center max-w-md mx-auto">
                        Connect Gemini 3 Pro to generate deep-dive forensic hypotheses on voice quality and traffic patterns.
                    </p>
                    <button onClick={handleRunAiAnalysis} disabled={isAiAnalyzing} className="px-12 py-5 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-emerald-600 transition-all">
                        {isAiAnalyzing ? 'Analyzing Network Telemetry...' : 'Execute Forensic Analysis'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center md:text-left">Sync Source: Genesys Cloud UAE (Pure.Cloud)</span>
         </div>
         <p className="text-[10px] font-black uppercase text-slate-300 text-center md:text-right">© {new Date().getFullYear()} Mawsool Labs • Super Chicken</p>
      </footer>
    </div>
  );
};

export default App;
