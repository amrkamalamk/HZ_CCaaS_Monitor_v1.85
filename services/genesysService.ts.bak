
import { UnifiedDataPoint, AgentPerformance, InteractionRecord, WrapUpData, BranchData, ReasonBranchData, CallerData, CustomerConversation } from "../types";

const LOCAL_PROXY_URL = '/api/genesys/proxy';
const SL_THRESHOLD_MS = 10000;

const WRAP_UP_LOOKUP: Record<string, string> = {
  'c649a66b-38c9-4ef5-b022-3445b061e5a0': 'Order Placed طلب',
  '7553e655-f4b2-44d9-9037-407d0ec9d5f6': 'Delay In Delivery تأخير في الطلب',
  '332220a7-576d-47fb-9b33-55ee16998fd9': 'Order Canceled الغاء طلب',
  'd3244924-1997-45bf-8df4-9a1ef95105e3': 'Complaint مشكلة في طلب',
  '6f6652bc-5a15-4c80-93c1-50c86ccec218': 'Inquiry استعلام',
  '6c340a6b-f981-4a24-aa7e-980533cb841e': 'Missed or Wrong Call رقم خاطئ او مكالمة فائتة',
  'ININ-WRAP-UP-TIMEOUT': 'ININ-WRAP-UP-TIMEOUT'
};

const SIM_BRANCH_LOOKUP: Record<string, string> = {
  '7734011011': 'Al-Dolai', '7735011011': 'Al-Dolai', '7834011011': 'Al-Dolai', '7835011011': 'Al-Dolai',
  '7742101010': 'Al-Krada', '7746101010': 'Al-Krada', '7842101010': 'Al-Krada', '7846101010': 'Al-Krada',
  '7736121212': 'Al-Sadr - Tawn Hyp.', '7737121212': 'Al-Sadr - Tawn Hyp.', '7836121212': 'Al-Sadr - Tawn Hyp.', '7837121212': 'Al-Sadr - Tawn Hyp.',
  '7732224446': 'ElMansour', '7732224447': 'ElMansour', '7832224447': 'ElMansour', '7852224447': 'ElMansour',
  '7722900007': 'Palestine St.', '7822400007': 'Palestine St.', '7722400007': 'Palestine St.',
  '7734171717': 'Palestine St. - Tawn Hyp.', '7735171717': 'Palestine St. - Tawn Hyp.', '7834171717': 'Palestine St. - Tawn Hyp.', '7835171717': 'Palestine St. - Tawn Hyp.',
  '7746161616': 'Salehia - Tawn Hyp.', '7747161616': 'Salehia - Tawn Hyp.', '7846161616': 'Salehia - Tawn Hyp.', '7847161616': 'Salehia - Tawn Hyp.',
  '7736141414': 'Al Jamiya', '7737141414': 'Al Jamiya', '7836141414': 'Al Jamiya', '7837141414': 'Al Jamiya',
  '7750000403': 'Zayouna', '7750000406': 'Zayouna', '7850000403': 'Zayouna', '7850000406': 'Zayouna'
};

async function genesysFetch(path: string, options: RequestInit = {}) {
  const url = `${LOCAL_PROXY_URL}?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.error || data.message || `Genesys API Error: ${res.status}`;
    throw new Error(errorMsg);
  }
  return data;
}

const getBaghdadInfo = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const hour = parseInt(get('hour'));
  const minute = parseInt(get('minute'));
  return {
    hour, minute,
    day: get('day'), month: get('month'), year: get('year'),
    intervalKey: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${minute >= 30 ? '30' : '00'}`
  };
};

export const getQueueIdByName = async (queueName: string) => {
  const data = await genesysFetch(`/api/v2/routing/queues?name=${encodeURIComponent(queueName.trim())}`);
  const queue = data.entities?.find((q: any) => q.name.toLowerCase() === queueName.toLowerCase());
  if (queue) return { queueId: queue.id };
  throw new Error(`Queue '${queueName}' not found.`);
};

export const fetchRealtimeMetrics = async (queueId: string, startDateStr?: string) => {
  const startStr = startDateStr || new Date().toISOString().split('T')[0];
  const dateObj = new Date(startStr);
  const shiftStart = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 6, 0, 0)); 
  const shiftEnd = new Date(shiftStart.getTime() + (18 * 60 * 60 * 1000)); 
  const intervalStr = `${shiftStart.toISOString().split('.')[0]}Z/${shiftEnd.toISOString().split('.')[0]}Z`;

  const buckets: Record<string, any> = {};
  for (let i = 0; i < 36; i++) {
    const time = new Date(shiftStart.getTime() + i * 30 * 60000);
    const { intervalKey } = getBaghdadInfo(time);
    buckets[intervalKey] = { offered: 0, answered: 0, slMet: 0, abandoned: 0, mosSum: 0, mosCount: 0, hSum: 0, hCount: 0, agents: new Set<string>() };
  }

  const agentMap: Record<string, AgentPerformance> = {};
  const wrapUpMap: Record<string, number> = {};
  const branchMap: Record<string, BranchData> = {};
  const reasonBranchMap: Record<string, number> = {};
  const callerMap: Record<string, number> = {};
  const customerConversations: CustomerConversation[] = [];

  let pageNumber = 1;
  let totalConversations: any[] = [];

  // Paging Loop to fix the 100-record cutoff
  while (true) {
    const data = await genesysFetch(`/api/v2/analytics/conversations/details/query`, {
      method: 'POST',
      body: JSON.stringify({ 
        interval: intervalStr, 
        paging: { pageSize: 100, pageNumber }, 
        segmentFilters: [{ type: "and", predicates: [{ type: "dimension", dimension: "queueId", operator: "matches", value: queueId }] }] 
      })
    });
    const pageConvs = data.conversations || [];
    totalConversations = [...totalConversations, ...pageConvs];
    if (pageConvs.length < 100 || pageNumber >= 20) break; // Limit safety
    pageNumber++;
  }

  totalConversations.forEach((conv: any) => {
    const startRaw = new Date(conv.conversationStart);
    const { intervalKey, year, month, day } = getBaghdadInfo(startRaw);
    if (!buckets[intervalKey]) return;
    
    const bucket = buckets[intervalKey];
    bucket.offered += 1;

    // Better ANI extraction
    let callerAni = 'Unknown';
    conv.participants?.forEach((p: any) => {
      p.sessions?.forEach((s: any) => {
        if (s.ani && s.ani !== 'Unknown') callerAni = s.ani.replace('tel:', '').replace('+', '');
      });
    });

    if (callerAni !== 'Unknown') {
      callerMap[callerAni] = (callerMap[callerAni] || 0) + 1;
    }

    const branchName = SIM_BRANCH_LOOKUP[callerAni] || 'Corporate';
    if (!branchMap[branchName]) {
      branchMap[branchName] = { name: branchName, offered: 0, answered: 0, abandoned: 0, slPercent: 0 };
    }
    const branch = branchMap[branchName];
    branch.offered += 1;

    let isAbandoned = true;
    let finalWrapUp = 'ININ-WRAP-UP-TIMEOUT';

    conv.participants?.forEach((p: any) => {
      if ((p.purpose === 'agent' || p.purpose === 'user') && p.userId) {
        bucket.agents.add(p.userId);
        if (!agentMap[p.userId]) {
          agentMap[p.userId] = { userId: p.userId, name: p.participantName || 'Agent', answered: 0, missed: 0, handleTimeMs: 0, firstActivity: startRaw, lastActivity: startRaw };
        }
        const agentRec = agentMap[p.userId];
        agentRec.lastActivity = startRaw > (agentRec.lastActivity || 0) ? startRaw : agentRec.lastActivity;

        p.sessions?.forEach((s: any) => {
          s.segments?.forEach((seg: any) => {
            if (seg.wrapUpCode) {
              const codeId = seg.wrapUpCode;
              const mappedName = WRAP_UP_LOOKUP[codeId] || codeId;
              finalWrapUp = mappedName;
              wrapUpMap[mappedName] = (wrapUpMap[mappedName] || 0) + 1;
              
              const rbKey = `${branchName}||${mappedName}`;
              reasonBranchMap[rbKey] = (reasonBranchMap[rbKey] || 0) + 1;
            }
            if (['interact', 'talk', 'hold'].includes(seg.segmentType)) {
              isAbandoned = false;
              const ss = new Date(seg.segmentStart), se = seg.segmentEnd ? new Date(seg.segmentEnd) : new Date();
              const dur = se.getTime() - ss.getTime();
              bucket.hSum += dur;
              agentRec.handleTimeMs += dur;
              if (seg.segmentType === 'interact' && (ss.getTime() - startRaw.getTime() <= SL_THRESHOLD_MS)) bucket.slMet += 1;
            }
          });
        });
        agentRec.answered += 1;
      }
      p.sessions?.forEach((s: any) => {
        if (s.mediaType === 'voice' && s.mediaEndpointStats) {
          s.mediaEndpointStats.forEach((stat: any) => {
            const score = stat.mos || stat.minMos;
            if (score > 0) { bucket.mosSum += score; bucket.mosCount += 1; }
          });
        }
      });
    });

    if (!isAbandoned) {
      bucket.answered += 1;
      bucket.hCount += 1;
      branch.answered += 1;
    } else {
      bucket.abandoned += 1;
      branch.abandoned += 1;
    }

    customerConversations.push({
      id: conv.conversationId, startTime: startRaw, ani: callerAni,
      abandoned: isAbandoned, businessDay: `${year}-${month}-${day}`
    });
  });

  const history = Object.keys(buckets).sort().map(k => ({
    timestamp: k, offered: buckets[k].offered, answered: buckets[k].answered, abandoned: buckets[k].abandoned,
    slPercent: buckets[k].offered > 0 ? (buckets[k].slMet / buckets[k].offered) * 100 : null,
    mos: buckets[k].mosCount > 0 ? buckets[k].mosSum / buckets[k].mosCount : null,
    aht: buckets[k].hCount > 0 ? (buckets[k].hSum / 1000) / buckets[k].hCount : null,
    agentsCount: buckets[k].agents.size, conversationsCount: buckets[k].offered
  }));

  Object.values(branchMap).forEach(b => {
    b.slPercent = b.offered > 0 ? (b.answered / b.offered) * 100 : 0;
  });

  return { 
    history, agents: Object.values(agentMap),
    wrapUpData: Object.entries(wrapUpMap).map(([name, count]) => ({ name, count })),
    branchData: Object.values(branchMap), 
    reasonBranchData: Object.entries(reasonBranchMap).map(([key, count]) => {
      const [branch, reason] = key.split('||');
      return { branch, reason, count };
    }),
    topCallers: Object.entries(callerMap).map(([number, count]) => ({ number, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    customerConversations
  };
};

export const fetchRecentInteractions = async (queueId: string): Promise<InteractionRecord[]> => {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000); 
  const interval = `${start.toISOString().split('.')[0]}Z/${now.toISOString().split('.')[0]}Z`;
  const data = await genesysFetch(`/api/v2/analytics/conversations/details/query`, {
    method: 'POST',
    body: JSON.stringify({ 
      interval: interval, 
      paging: { pageSize: 50, pageNumber: 1 },
      segmentFilters: [{ type: "and", predicates: [{ type: "dimension", dimension: "queueId", operator: "matches", value: queueId }] }] 
    })
  });
  return (data.conversations || []).map((conv: any) => ({
    id: conv.conversationId, startTime: new Date(conv.conversationStart),
    direction: 'Inbound',
    durationMs: conv.conversationEnd ? new Date(conv.conversationEnd).getTime() - new Date(conv.conversationStart).getTime() : 0
  }));
};
