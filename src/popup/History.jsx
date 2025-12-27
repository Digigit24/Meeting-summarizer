import React, { useState, useEffect } from 'react';
import { Search, Play, Clipboard, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

const BACKEND_URL = "http://127.0.0.1:3001/api";

export default function History() {
  const [meetings, setMeetings] = useState([]);
  const [filteredMeetings, setFilteredMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/meetings`, {
         headers: { 'x-api-key': 'my-secret-extension-key' }
    })
      .then(res => res.json())
      .then(data => {
          setMeetings(data);
          setFilteredMeetings(data);
          setLoading(false);
      })
      .catch(err => {
          console.error("Failed to fetch history", err);
          setLoading(false);
      });
  }, []);

  useEffect(() => {
      if(!searchTerm) {
          setFilteredMeetings(meetings);
          return;
      }
      const lower = searchTerm.toLowerCase();
      setFilteredMeetings(meetings.filter(m => 
          (m.name && m.name.toLowerCase().includes(lower)) ||
          (m.summary && m.summary.toLowerCase().includes(lower))
      ));
  }, [searchTerm, meetings]);

  const toggleExpand = (id) => {
      setExpandedId(expandedId === id ? null : id);
  };

  const copyToClipboard = (text) => {
      navigator.clipboard.writeText(text);
      // Optional: Toast notification
  };

  const parseSummary = (jsonStr) => {
      try {
          return JSON.parse(jsonStr);
      } catch (e) {
          return { summary_points: ["Error parsing summary"] };
      }
  };
  
  const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
      <div className="flex items-center justify-center h-full text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Search Bar */}
      <div className="p-4 bg-slate-900 sticky top-0 z-10 shadow-md">
          <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input 
                  type="text" 
                  placeholder="Search meetings..." 
                  className="w-full bg-slate-800 text-sm text-white rounded-lg pl-9 pr-4 py-2 border border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none placeholder-slate-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          {filteredMeetings.length === 0 ? (
              <div className="text-center mt-10 text-slate-500 text-sm">No meetings found.</div>
          ) : (
              filteredMeetings.map((m) => {
                  const data = m.summary ? parseSummary(m.summary) : {};
                  const isExpanded = expandedId === m.id;
                  
                  return (
                    <div key={m.id} className={`bg-slate-800/80 backdrop-blur rounded-xl border border-slate-700/50 transition-all duration-300 ${isExpanded ? 'ring-2 ring-blue-500/20' : 'hover:bg-slate-800'}`}>
                        {/* Card Header */}
                        <div 
                            className="p-3 cursor-pointer"
                            onClick={() => toggleExpand(m.id)}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-slate-100 text-sm">{data.title || m.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Calendar className="h-3 w-3 text-slate-500" />
                                        <span className="text-xs text-slate-500">{formatDate(m.created_at)}</span>
                                        {data.overall_sentiment && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                                data.overall_sentiment.toLowerCase().includes('positive') ? 'border-green-500/30 text-green-400 bg-green-500/10' : 
                                                data.overall_sentiment.toLowerCase().includes('tense') ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                                'border-slate-500/30 text-slate-400 bg-slate-500/10'
                                            }`}>
                                                {data.overall_sentiment}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                            <div className="px-3 pb-3 border-t border-slate-700/50 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* Summary Points */}
                                {data.summary_points && (
                                    <div className="mb-3">
                                        <h4 className="text-xs font-semibold text-blue-400 mb-1 uppercase tracking-wider">Key Points</h4>
                                        <ul className="list-disc list-inside space-y-1">
                                            {data.summary_points.map((p, i) => (
                                                <li key={i} className="text-xs text-slate-300 leading-relaxed">{p}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                
                                {/* Action Items */}
                                {m.action_items && m.action_items.length > 0 && (
                                    <div className="mb-3">
                                         <h4 className="text-xs font-semibold text-purple-400 mb-1 uppercase tracking-wider">Action Items</h4>
                                         <div className="space-y-1">
                                            {m.action_items.map((item, i) => (
                                                <div key={i} className="flex items-start text-xs bg-slate-900/50 p-1.5 rounded border border-slate-700/50">
                                                    <span className="font-medium text-slate-200 mr-1">{item.assignee}:</span>
                                                    <span className="text-slate-400 flex-1">{item.task}</span>
                                                    {item.deadline && <span className="text-[10px] text-slate-500 ml-1 italic">{item.deadline}</span>}
                                                </div>
                                            ))}
                                         </div>
                                    </div>
                                )}

                                {/* Controls */}
                                <div className="flex gap-2 mt-3 pt-2 border-t border-slate-700/30">
                                    <button 
                                        onClick={() => window.open(m.s3_url, '_blank')}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-white transition-colors"
                                    >
                                        <Play className="h-3 w-3 fill-current" />
                                        Play Audio
                                    </button>
                                    <button 
                                        onClick={() => copyToClipboard(JSON.stringify(data, null, 2))}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-xs text-white transition-colors"
                                    >
                                        <Clipboard className="h-3 w-3" />
                                        Copy Summary
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                  );
              })
          )}
      </div>
    </div>
  );
}
