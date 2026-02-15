import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { 
  Camera, Upload, CheckCircle2, Trash2, Sparkles, 
  User, Shirt, Image as ImageIcon, Loader2, 
  Download, Maximize2, Layers, ChevronRight, Plus 
} from 'lucide-react';

// FIX: Pull from Vite environment variable
const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

function App() {
  const [modelImage, setModelImage] = useState(null);
  const [wardrobe, setWardrobe] = useState([]);
  const [results, setResults] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('studio');

  const modelInputRef = useRef(null);
  const wardrobeInputRef = useRef(null);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleModelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setModelImage(`data:${file.type};base64,${base64}`);
  };

  const handleWardrobeUpload = async (e) => {
    const files = Array.from(e.target.files);
    const newItems = await Promise.all(files.map(async (file) => ({
      id: Math.random().toString(36).substr(2, 9),
      url: await fileToBase64(file),
      type: file.type,
      name: file.name
    })));
    setWardrobe(prev => [...prev, ...newItems]);
  };

  const removeWardrobeItem = (id) => {
    setWardrobe(prev => prev.filter(item => item.id !== id));
  };

  const generateTryOn = async () => {
    if (!modelImage || wardrobe.length === 0) return;
    
    setIsGenerating(true);
    setActiveTab('results');
    const newResults = [];

    for (const item of wardrobe) {
      try {
        // Step 1: Spatial & Pose Analysis of the Reference Image
        const spatialAnalysisPrompt = "Identify the person's pose and orientation in Image 1. Specifically: What direction is the head facing? What is the angle of the shoulders? Where is the main light source coming from? Answer with technical detail for a 3D mapping task.";
        const analysisRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: spatialAnalysisPrompt },
                { inlineData: { mimeType: "image/png", data: modelImage.split(',')[1] } }
              ]
            }]
          })
        });
        const spatialData = await analysisRes.json();
        const poseTraits = spatialData.candidates?.[0]?.content?.parts?.[0]?.text;

        // Step 2: Clothing Texture Analysis
        const clothAnalysisRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Describe this clothing item's fabric, silhouette, and drape." },
                { inlineData: { mimeType: item.type, data: item.url } }
              ]
            }]
          })
        });
        const clothData = await clothAnalysisRes.json();
        const clothTraits = clothData.candidates?.[0]?.content?.parts?.[0]?.text;

        // Step 3: Pose-Synchronized Synthesis
        const synthesisPrompt = `HIGH-FIDELITY POSE-MATCHED IN-PAINTING:
        - REFERENCE IMAGE 1: The Human Subject (Locked Face & Pose)
        - REFERENCE IMAGE 2: Target Garment
        
        CRITICAL CONSTRAINTS:
        1. POSE SYNC: The person is oriented as follows: ${poseTraits}. You MUST render the new clothing to match this EXACT body orientation and head angle.
        2. PIXEL LOCK: Do not change the facial features, hairstyle, or background of Image 1.
        3. LIGHTING MATCH: The shadows on the new garment must match the light direction identified in the pose analysis.
        4. OUTFIT SWAP: Replace the existing clothes with ${item.name} (${clothTraits}). Ensure the clothing drapes realistically over the body silhouette in Image 1.
        5. PERSPECTIVE: If the person is facing sideways, the clothing must be seen from that same sideways perspective.`;

        const synthesisRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: synthesisPrompt },
                { inlineData: { mimeType: "image/png", data: modelImage.split(',')[1] } },
                { inlineData: { mimeType: item.type, data: item.url } }
              ]
            }],
            generationConfig: { 
              responseModalities: ['TEXT', 'IMAGE'],
              temperature: 0.1
            }
          })
        });

        const synthesisData = await synthesisRes.json();
        const base64Image = synthesisData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (base64Image) {
          newResults.push({
            id: Math.random(),
            url: `data:image/png;base64,${base64Image}`,
            outfit: item.name
          });
        }
      } catch (err) {
        console.error("Pose mapping failed", err);
      }
    }

    setResults(prev => [...newResults, ...prev]);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#1A1A1A] font-light antialiased">
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#F0F0F0] px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#1A1A1A] rounded-full flex items-center justify-center">
            <Layers className="text-white w-4 h-4" />
          </div>
          <h1 className="text-lg font-medium tracking-[0.2em] uppercase italic">Fit Mapper</h1>
        </div>
        
        <div className="flex gap-1 bg-[#F5F5F5] p-1 rounded-full border border-[#EDEDED]">
          <button 
            onClick={() => setActiveTab('studio')}
            className={`px-6 py-2 rounded-full text-[11px] tracking-widest uppercase transition-all duration-500 ${activeTab === 'studio' ? 'bg-white shadow-sm text-[#1A1A1A] font-semibold' : 'text-[#888] hover:text-[#1A1A1A]'}`}
          >
            Atelier
          </button>
          <button 
            onClick={() => setActiveTab('results')}
            className={`px-6 py-2 rounded-full text-[11px] tracking-widest uppercase transition-all duration-500 ${activeTab === 'results' ? 'bg-white shadow-sm text-[#1A1A1A] font-semibold' : 'text-[#888] hover:text-[#1A1A1A]'}`}
          >
            Collection
          </button>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-8 pt-32 pb-24">
        {activeTab === 'studio' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-end justify-between border-b border-[#F0F0F0] pb-4">
                <div>
                  <h2 className="text-[10px] uppercase tracking-[0.3em] text-[#999] mb-1 font-bold">Ref. Alpha</h2>
                  <p className="text-xl font-light italic serif">Human Silhouette</p>
                </div>
                {modelImage && (
                  <div className="flex items-center gap-2 text-[10px] tracking-widest text-[#B5A48B] font-bold uppercase">
                    <CheckCircle2 className="w-3 h-3" />
                    Pose & Face Locked
                  </div>
                )}
              </div>
              
              <div className="relative group aspect-[4/5] bg-[#F9F9F9] border border-[#EEEEEE] overflow-hidden transition-all duration-700 hover:border-[#D1C4B0]">
                {modelImage ? (
                  <>
                    <img src={modelImage} alt="Reference" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center gap-4">
                      <button onClick={() => modelInputRef.current?.click()} className="bg-white text-black px-6 py-3 rounded-none text-[10px] tracking-[0.2em] uppercase hover:bg-black hover:text-white transition-all">Replace</button>
                      <button onClick={() => setModelImage(null)} className="bg-white/90 text-red-800 p-3 rounded-none hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="mb-8 relative">
                      <div className="w-20 h-20 border border-[#E0E0E0] rounded-full animate-ping absolute scale-150 opacity-20"></div>
                      <div className="w-20 h-20 bg-white border border-[#F0F0F0] rounded-full flex items-center justify-center relative z-10 shadow-sm">
                        <Camera className="text-[#CCC] w-6 h-6" />
                      </div>
                    </div>
                    <button 
                      onClick={() => modelInputRef.current?.click()} 
                      className="group flex items-center gap-4 text-[11px] tracking-[0.3em] uppercase font-bold"
                    >
                      <span>Upload Reference Pose</span>
                      <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-2" />
                    </button>
                  </div>
                )}
                <input ref={modelInputRef} type="file" hidden accept="image/*" onChange={handleModelUpload} />
              </div>
            </div>

            <div className="lg:col-span-5 space-y-8">
              <div className="border-b border-[#F0F0F0] pb-4">
                <h2 className="text-[10px] uppercase tracking-[0.3em] text-[#999] mb-1 font-bold">Ref. Beta</h2>
                <p className="text-xl font-light italic serif">Garment Selection</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {wardrobe.map((item) => (
                  <div key={item.id} className="relative group aspect-square bg-white border border-[#F0F0F0] overflow-hidden transition-all hover:shadow-xl">
                    <img src={`data:image/png;base64,${item.url}`} className="w-full h-full object-contain p-6 grayscale hover:grayscale-0 transition-all duration-700" alt="Cloth" />
                    <button 
                      onClick={() => removeWardrobeItem(item.id)} 
                      className="absolute top-4 right-4 bg-white p-2 text-black opacity-0 group-hover:opacity-100 transition-opacity border border-[#EEE]"
                    >
                      <Plus className="w-3 h-3 rotate-45" />
                    </button>
                  </div>
                ))}
                
                <button 
                  onClick={() => wardrobeInputRef.current?.click()} 
                  className="aspect-square border border-dashed border-[#DDD] bg-[#FBFBFB] flex flex-col items-center justify-center text-[#999] hover:bg-white hover:border-[#B5A48B] transition-all duration-500"
                >
                  <Plus className="w-6 h-6 mb-3 stroke-1" />
                  <span className="text-[9px] tracking-[0.2em] uppercase font-bold">Import Fabric</span>
                  <input ref={wardrobeInputRef} type="file" hidden multiple accept="image/*" onChange={handleWardrobeUpload} />
                </button>
              </div>

              <div className="pt-12">
                <button
                  disabled={!modelImage || wardrobe.length === 0 || isGenerating}
                  onClick={generateTryOn}
                  className={`w-full py-6 rounded-none text-[11px] tracking-[0.4em] uppercase transition-all duration-700 relative overflow-hidden group ${
                    (!modelImage || wardrobe.length === 0) 
                    ? 'bg-[#F0F0F0] text-[#CCC]' 
                    : 'bg-[#1A1A1A] text-white hover:bg-[#B5A48B]'
                  }`}
                >
                  {isGenerating ? (
                    <div className="flex items-center justify-center gap-4">
                      <Loader2 className="w-4 h-4 animate-spin stroke-1" />
                      <span>Calibrating Pose & Perspective</span>
                    </div>
                  ) : (
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      <Sparkles className="w-4 h-4" />
                      Map Fits to Pose
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-1000">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-light serif italic">Curated Lookbook</h2>
              <p className="text-[10px] tracking-[0.4em] uppercase text-[#999]">Synchronized to your reference orientation</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              {isGenerating && (
                <div className="aspect-[4/5] bg-[#F9F9F9] border border-[#F0F0F0] flex flex-col items-center justify-center space-y-8 p-12">
                  <Loader2 className="w-10 h-10 text-[#B5A48B] animate-spin stroke-1" />
                  <div className="text-center space-y-2">
                    <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-[#1A1A1A]">Aligning Perspective</p>
                    <p className="text-[10px] text-[#AAA] tracking-widest leading-loose text-center">Matching clothing shadows to your reference lighting...</p>
                  </div>
                </div>
              )}
              
              {results.map((res) => (
                <div key={res.id} className="group relative bg-white border border-[#F0F0F0] overflow-hidden transition-all duration-1000 hover:shadow-2xl">
                  <img src={res.url} alt="Result" className="w-full aspect-[4/5] object-cover transition-transform duration-[2000ms] group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8">
                    <div className="flex items-center justify-between text-white border-t border-white/20 pt-4">
                      <div>
                        <p className="text-[11px] font-medium tracking-wider uppercase">{res.outfit}</p>
                      </div>
                      <div className="flex gap-4">
                        <a href={res.url} download={`fit-${res.outfit}.png`} className="hover:text-[#B5A48B] transition-colors"><Download className="w-4 h-4" /></a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
