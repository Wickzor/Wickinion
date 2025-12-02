import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardDef, CardType, GameState, BoardSetup, Player, GameMode, NetworkMessage, GameActionPayload } from './types';
import { CARDS, BOARD_SETUPS, STARTING_DECK, BASIC_CARDS } from './constants';
import { CardDisplay } from './components/CardDisplay';
import { RotateCcw, Sparkles, Play, Coins, Crown, Map as MapIcon, Sword, Layers, X, Trophy, Volume2, VolumeX, Eye, ArrowRight, Zap, Skull, Users, User, Wifi, Copy, CheckCircle, Repeat, Check, Trash2, ArrowUpCircle, ShieldAlert, ChevronRight, Hourglass, Menu, Scroll, ShoppingBag, Lock, Maximize, Minimize, Flame, Swords, Loader, BookOpen, LogOut, SkipForward, PlayCircle } from 'lucide-react';
import { Peer, DataConnection } from 'peerjs';

// --- Types for Interactions ---
interface Interaction {
  id: string;
  type: 'HAND_SELECTION' | 'SUPPLY_SELECTION' | 'CUSTOM_SELECTION' | 'CONFIRMATION';
  source: string; // Card Name
  min: number;
  max: number; // -1 for unlimited
  targetPlayerIndex?: number;
  
  // For CUSTOM_SELECTION (e.g., Sentry looking at top cards)
  customCards?: CardDef[]; 
  
  filter?: (c: CardDef) => boolean;
  filterMessage?: string;
  onResolve: (selectedCards: CardDef[], selectedIndices: number[]) => void;
  confirmLabel?: string;
}

// Fisher-Yates shuffle
const shuffle = (array: CardDef[]): CardDef[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// --- Audio Configuration ---
const SOUNDS = {
  music: "./menu_music.mp3", 
  fireplace: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d4/Enclosed_fireplace_sounds.ogg/Enclosed_fireplace_sounds.ogg.mp3", 
  flip: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/9b/Card_flip.ogg/Card_flip.ogg.mp3", 
  shuffle: "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/22/Card_shuffle.ogg/Card_shuffle.ogg.mp3",
  buy: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/52/Coin_drop_on_concrete.ogg/Coin_drop_on_concrete.ogg.mp3" 
};

// Animated Resource Component with Physical Presence
const ResourceCounter = ({ value, label, icon }: { value: number, label: string, icon?: React.ReactNode }) => {
  const [animate, setAnimate] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 200);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-0.5 md:gap-1 lg:gap-1 group relative">
       {/* Backlight Glow */}
       <div className={`absolute inset-0 bg-gold rounded-full blur-xl opacity-0 transition-opacity duration-300 ${animate ? 'opacity-40' : 'group-hover:opacity-10'}`}></div>
       
       <div className={`relative w-10 h-10 md:w-12 md:h-12 lg:w-10 lg:h-10 xl:w-12 xl:h-12 2xl:w-28 2xl:h-28 rounded-full flex items-center justify-center bg-gradient-to-br from-[#2c1e16] to-black shadow-token border border-[#8a6e38] transition-transform duration-200 ${animate ? 'scale-110 brightness-110' : 'group-hover:scale-105'}`}>
          <div className="absolute inset-0 rounded-full border border-[#ffffff]/10"></div>
          <span className={`text-lg md:text-xl lg:text-lg xl:text-xl 2xl:text-5xl font-sans font-black text-gold-light text-emboss z-10`}>{value}</span>
       </div>
       <div className="flex items-center gap-1 text-[#8a6e38] text-[6px] md:text-[8px] lg:text-[8px] xl:text-[10px] 2xl:text-base font-serif tracking-[0.2em] uppercase font-bold drop-shadow-sm">{icon} {label}</div>
    </div>
  );
};

// Ember Particle Component
const EmberParticles = () => {
    const particles = Array.from({ length: 15 });
    return (
        <div className="fixed inset-0 pointer-events-none z-[2]">
            {particles.map((_, i) => (
                <div 
                    key={i} 
                    className="ember"
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 10}s`,
                        opacity: Math.random() * 0.7
                    }}
                />
            ))}
        </div>
    );
}

interface FloatingText { id: number; text: string; color: string; }

export default function App() {
  // --- Loading State ---
  const [bootPhase, setBootPhase] = useState<'LOADING' | 'INTRO' | 'MENU'>('LOADING');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Initializing Realm...");

  // --- Game State ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [supply, setSupply] = useState<Record<string, number>>({});
  const [trash, setTrash] = useState<CardDef[]>([]); // New Trash Pile
  const [turnCount, setTurnCount] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [log, setLog] = useState<string[]>(["Welcome to Wickinion!"]);
  const [turnPhase, setTurnPhase] = useState<'ACTION' | 'BUY'>('ACTION');
  
  // --- Interaction State ---
  const [interactionQueue, setInteractionQueue] = useState<Interaction[]>([]);
  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([]);
  const [viewingSupplyCard, setViewingSupplyCard] = useState<CardDef | null>(null);
  
  // NEW: State for action card confirmation
  const [confirmingCardIndex, setConfirmingCardIndex] = useState<number | null>(null);
  
  // --- Online Multiplayer State ---
  const [gameMode, setGameMode] = useState<GameMode>('LOCAL');
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null); 
  const [peerId, setPeerId] = useState<string>('');
  const [hostIdInput, setHostIdInput] = useState('');
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Refs
  const peerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<DataConnection[]>([]); 
  const clientConnectionRef = useRef<DataConnection | null>(null);
  const processingRef = useRef<boolean>(false); 

  // --- STATE REF (Crucial for PeerJS callbacks to see latest state) ---
  const gameStateRef = useRef({
      players, supply, currentPlayerIndex, turnCount, log, gameMode, myPlayerId, turnPhase, trash, actionMultiplier: 1, interactionQueue
  });
  
  // Sync Ref with State
  useEffect(() => {
      gameStateRef.current = {
          players, supply, currentPlayerIndex, turnCount, log, gameMode, myPlayerId, turnPhase, trash, interactionQueue, actionMultiplier: gameStateRef.current.actionMultiplier
      };
  }, [players, supply, currentPlayerIndex, turnCount, log, gameMode, myPlayerId, turnPhase, trash, interactionQueue]);


  // UI State
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false); // New Log Modal
  const [gameMenuOpen, setGameMenuOpen] = useState(false); // Replaces mobileMenuOpen
  const [hasStarted, setHasStarted] = useState(false); 
  const [showGameSetup, setShowGameSetup] = useState(false); 
  const [showOnlineMenu, setShowOnlineMenu] = useState(false); 
  const [showGuide, setShowGuide] = useState(false); // New Guide Modal State
  const [selectedBoardId, setSelectedBoardId] = useState<string>('first_game');
  const [playerCountMode, setPlayerCountMode] = useState<number>(2); 
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null);
  const [shakingCardId, setShakingCardId] = useState<string | null>(null); 
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Logic State
  const [actionMultiplier, setActionMultiplier] = useState<number>(1); 
  
  // Sync local multiplier to ref
  useEffect(() => {
      gameStateRef.current.actionMultiplier = actionMultiplier;
  }, [actionMultiplier]);

  // Audio
  const [isMuted, setIsMuted] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  // Computed
  const currentPlayer = players[currentPlayerIndex];
  const currentInteraction = interactionQueue.length > 0 ? interactionQueue[0] : null;
  const isInteracting = !!currentInteraction;
  const activePlayerIndex = currentInteraction?.targetPlayerIndex ?? currentPlayerIndex;
  const activePlayer = players[activePlayerIndex];
  const isMyTurn = gameMode === 'LOCAL' || (myPlayerId === activePlayerIndex);
  
  // Strict Phase Display
  const currentPhaseLabel = turnPhase === 'ACTION' ? 'ACTION PHASE' : 'BUY PHASE';

  // --- Boot Sequence & Audio Engine ---
  useEffect(() => {
    // 1. Initialize Audio Objects
    audioRefs.current = {
      music: new Audio(SOUNDS.music),
      fireplace: new Audio(SOUNDS.fireplace),
      flip: new Audio(SOUNDS.flip),
      shuffle: new Audio(SOUNDS.shuffle),
      buy: new Audio(SOUNDS.buy),
    };
    audioRefs.current.music.loop = true;
    audioRefs.current.music.volume = 0.2; 
    audioRefs.current.fireplace.loop = true;
    audioRefs.current.fireplace.volume = 0.4;
    
    const loadAudio = (audio: HTMLAudioElement) => {
        audio.load();
    };
    Object.values(audioRefs.current).forEach(loadAudio);

    const preloadImages = async (srcs: string[], onProgress: (progress: number) => void) => {
        let loaded = 0;
        const total = srcs.length;
        
        const promises = srcs.map((src) => {
            return new Promise<void>((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = () => {
                    loaded++;
                    onProgress((loaded / total) * 100);
                    resolve();
                };
                img.onerror = () => {
                    loaded++;
                    onProgress((loaded / total) * 100);
                    resolve();
                };
            });
        });
        await Promise.all(promises);
    };

    const bootGame = async () => {
        const loadingTips = [
            "Shuffling the King's deck...",
            "Polishing gold coins...",
            "Scouting the provinces...",
            "Sharpening swords...",
            "Consulting the archives...",
            "Preparing the throne room...",
        ];
        const textInterval = setInterval(() => {
            setLoadingText(loadingTips[Math.floor(Math.random() * loadingTips.length)]);
        }, 1500);

        const cardImages = Object.values(CARDS).map(c => c.image);
        const uiAssets = ['./booting.png', './startmenu.png'];
        const allAssets = [...cardImages, ...uiAssets];

        const minTimePromise = new Promise(resolve => setTimeout(resolve, 4000));
        const assetPromise = preloadImages(allAssets, (pct) => {
            setLoadingProgress(Math.min(90, pct));
        });

        await Promise.all([minTimePromise, assetPromise]);

        clearInterval(textInterval);
        setLoadingProgress(100);
        setLoadingText("Enter the Realm");
        
        // Go to Intro Gate instead of directly to menu
        setTimeout(() => {
            setBootPhase('INTRO');
        }, 800);
    };

    bootGame();

    return () => {
      Object.values(audioRefs.current).forEach((audio: any) => { 
        if (audio && typeof audio.pause === 'function') {
          audio.pause(); 
          audio.src = "";
        }
      });
      peerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
      const handleFullScreenChange = () => {
          setIsFullScreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => {
          document.removeEventListener('fullscreenchange', handleFullScreenChange);
      };
  }, []);

  const toggleFullScreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
              console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  const playSfx = (name: 'flip' | 'shuffle' | 'buy') => {
    if (isMuted || !audioRefs.current[name]) return;
    const original = audioRefs.current[name];
    if (!original) return;
    try {
        const clone = original.cloneNode() as HTMLAudioElement;
        clone.playbackRate = 0.95 + Math.random() * 0.1;
        clone.volume = Math.min(1, (original.volume * 0.8) + (Math.random() * 0.2));
        clone.play().catch(e => console.log('SFX play failed (likely autoplay policy):', e));
    } catch (e) {
        original.currentTime = 0;
        original.play().catch(() => {});
    }
  };

  useEffect(() => {
    const { music, fireplace } = audioRefs.current;
    if (!music || !fireplace) return;

    if (!isMuted) {
        // Music plays generally (Menu + Game) - unlocked by Intro Gate
        if (bootPhase === 'MENU' || hasStarted) {
           music.play().catch(e => console.log("Music autoplay blocked, waiting for interaction"));
        }
        
        // Fireplace only plays during active game
        if (hasStarted) {
            fireplace.play().catch(e => console.log("Ambience autoplay blocked"));
        } else {
            fireplace.pause();
        }
    } else {
        music.pause();
        fireplace.pause();
    }
  }, [isMuted, hasStarted, bootPhase]);

  const unlockAudio = () => {
      if (isMuted) return;
      
      // Try to unlock music anywhere (Menu or Game)
      if (audioRefs.current.music && audioRefs.current.music.paused) {
          audioRefs.current.music.play().catch(() => {});
      }
      
      // Only unlock fireplace if game started
      if (hasStarted && audioRefs.current.fireplace && audioRefs.current.fireplace.paused) {
          audioRefs.current.fireplace.play().catch(() => {});
      }
  };
  
  const handleEnterRealm = () => {
      unlockAudio();
      playSfx('flip');
      setBootPhase('MENU');
  };

  const addLog = (message: string) => setLog(prev => [...prev, message]);
  const addFloatingText = (text: string, color: string = "text-white") => {
    const id = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id, text, color }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1500);
  };
  
  const triggerShake = (id: string) => {
    setShakingCardId(id);
    setTimeout(() => setShakingCardId(null), 500);
  };

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log, isLogOpen]);

  // --- Helpers ---
  const calculateScore = (player: Player) => {
    const allCards = [...player.deck, ...player.hand, ...player.discard, ...player.playArea];
    return allCards.reduce((acc, c) => {
        if (c.id === 'gardens') {
            return acc + Math.floor(allCards.length / 10);
        }
        return acc + (c.points || 0);
    }, 0);
  };

  // --- Networking Logic ---

  const initHost = () => {
    unlockAudio();
    const peer = new Peer();
    peerRef.current = peer;
    (peer as any).on('open', (id: string) => { setPeerId(id); setLobbyStatus('Waiting for challengers...'); setMyPlayerId(0); });
    (peer as any).on('connection', (conn: any) => {
        hostConnectionsRef.current.push(conn);
        setConnectedPeers(prev => [...prev, conn.peer]);
        conn.on('data', (data: any) => handleNetworkMessage(data as NetworkMessage));
        conn.on('close', () => setConnectedPeers(prev => prev.filter(p => p !== conn.peer)));
    });
  };

  const joinGame = () => {
      if (!hostIdInput || isConnecting) return;
      unlockAudio();
      setIsConnecting(true);
      const peer = new Peer();
      peerRef.current = peer;
      (peer as any).on('open', () => {
          const conn = peer.connect(hostIdInput);
          clientConnectionRef.current = conn;
          setLobbyStatus('Connecting to realm...');
          
          const connectionTimeout = setTimeout(() => {
              if (lobbyStatus !== 'Connected! Awaiting host...') {
                 setIsConnecting(false);
                 setLobbyStatus('Connection timed out. Check Host ID.');
              }
          }, 10000);

          (conn as any).on('open', () => { 
              clearTimeout(connectionTimeout);
              setLobbyStatus('Connected! Awaiting host...'); 
              setGameMode('ONLINE_CLIENT'); 
          });
          (conn as any).on('data', (data: any) => handleNetworkMessage(data as NetworkMessage));
          (conn as any).on('error', () => {
              clearTimeout(connectionTimeout);
              setIsConnecting(false);
              setLobbyStatus('Connection failed.');
          });
      });
      (peer as any).on('error', (err: any) => {
          setIsConnecting(false);
          setLobbyStatus('Peer Error: ' + err.type);
      });
  };

  // BROADCAST LOOP: Automatically sync state to clients when acting as host
  useEffect(() => {
      if (gameMode === 'ONLINE_HOST' && hasStarted) {
          // Debounce slightly to allow batched state updates to settle
          const timer = setTimeout(() => {
              // Strip non-serializable functions from interaction queue
              const serializableQueue = interactionQueue.map(i => ({
                  ...i,
                  onResolve: undefined, 
                  filter: undefined, 
              }));
              
              const payload = { 
                  players, 
                  supply, 
                  turnCount, 
                  currentPlayerIndex, 
                  log, 
                  turnPhase, 
                  interactionQueue: serializableQueue 
              };
              hostConnectionsRef.current.forEach(conn => conn.send({ type: 'STATE_UPDATE', payload }));
          }, 50);
          return () => clearTimeout(timer);
      }
  }, [players, supply, turnCount, currentPlayerIndex, log, turnPhase, interactionQueue, gameMode, hasStarted]);

  const sendActionToHost = (payload: GameActionPayload) => {
      if (gameMode !== 'ONLINE_CLIENT' || !clientConnectionRef.current) return;
      clientConnectionRef.current.send({ type: 'ACTION', payload: { ...payload, playerIndex: myPlayerId } });
  };

  // FIXED: Handle message uses stateRef to avoid stale closures
  const handleNetworkMessage = (msg: NetworkMessage) => {
      const state = gameStateRef.current; // ALWAYS use latest state for logic decisions

      if (msg.type === 'STATE_UPDATE') {
          const { players: p, supply: s, turnCount: t, currentPlayerIndex: c, log: l, turnPhase: tp, interactionQueue: iq } = msg.payload;
          setPlayers(p); setSupply(s); setTurnCount(t); setCurrentPlayerIndex(c); setLog(l);
          if (tp) setTurnPhase(tp); // Sync phase
          if (iq) setInteractionQueue(iq); // Sync interactions
          if (!hasStarted) { setHasStarted(true); setShowGameSetup(false); setShowOnlineMenu(false); setIsConnecting(false); }
      } 
      else if (msg.type === 'START_GAME') {
          setMyPlayerId(msg.payload.yourPlayerId);
          setHasStarted(true); setShowGameSetup(false); setShowOnlineMenu(false);
          setGameMode('ONLINE_CLIENT');
          addLog("Connected to Online Game.");
          setIsConnecting(false);
      }
      else if (msg.type === 'RESOLVE_INTERACTION') {
          // Client responding to an interaction request
          if (state.gameMode !== 'ONLINE_HOST') return;
          const { id, indices } = msg.payload;
          
          // Find the interaction in the local (Host) queue that has the function attached
          const interaction = state.interactionQueue.find(i => i.id === id);
          if (interaction) {
              const activeP = state.players[interaction.targetPlayerIndex || state.currentPlayerIndex];
              let selectedCards: CardDef[] = [];
              if (interaction.type === 'CUSTOM_SELECTION' && interaction.customCards) {
                  selectedCards = indices.map((i: number) => interaction.customCards![i]);
              } else {
                  selectedCards = indices.map((i: number) => activeP.hand[i]);
              }
              // Execute the callback
              interaction.onResolve(selectedCards, indices);
              // Remove from queue
              setInteractionQueue(prev => prev.slice(1));
          }
      }
      else if (msg.type === 'ACTION') {
          // This block runs on HOST
          if (state.gameMode !== 'ONLINE_HOST') return;
          const { actionType, playerIndex, cardIndex, cardId } = msg.payload;
          
          // Validation against live state
          if (playerIndex !== state.currentPlayerIndex) {
              console.warn(`Ignored action from player ${playerIndex} (Current Turn: ${state.currentPlayerIndex})`);
              return; 
          }

          // Use the execute functions which now read from ref to ensure atomic updates
          if (actionType === 'PLAY_CARD' && typeof cardIndex === 'number') executePlayCard(playerIndex, cardIndex);
          else if (actionType === 'BUY_CARD' && cardId) executeBuyCard(playerIndex, cardId);
          else if (actionType === 'PLAY_ALL_TREASURES') executePlayAllTreasures(playerIndex);
          else if (actionType === 'END_TURN') executeEndTurn(playerIndex);
      }
  };

  // --- Reset & Exit Logic ---
  const exitGame = () => {
    setHasStarted(false);
    setGameOver(false);
    setPlayers([]);
    setSupply({});
    setTrash([]);
    setLog(["Welcome to Wickinion!"]);
    setInteractionQueue([]);
    setSelectedHandIndices([]);
    setViewingSupplyCard(null);
    setTurnCount(1);
    setCurrentPlayerIndex(0);
    setTurnPhase('ACTION');
    setConfirmingCardIndex(null);
    setIsDiscardOpen(false);
    setIsTrashOpen(false);
    setIsLogOpen(false);
    setGameMenuOpen(false);
    
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }
    hostConnectionsRef.current = [];
    clientConnectionRef.current = null;
    
    setGameMode('LOCAL');
    setConnectedPeers([]);
    setMyPlayerId(null);
    setPeerId('');
    setLobbyStatus('');
    setIsConnecting(false);
  };


  // --- Game Mechanics ---

  const checkGameOver = (currentSupply: Record<string, number>) => {
    if ((currentSupply['province'] ?? 0) <= 0) return true;
    if ((currentSupply['duchy'] ?? 0) <= 0) return true;
    if ((currentSupply['estate'] ?? 0) <= 0) return true;
    const emptyPiles = Object.values(currentSupply).filter(count => count <= 0).length;
    return emptyPiles >= 3;
  };

  const drawCards = useCallback((count: number, currentDeck: CardDef[], currentDiscard: CardDef[], currentHand: CardDef[]) => {
    let newDeck = [...currentDeck];
    let newDiscard = [...currentDiscard];
    let newHand = [...currentHand];
    let didShuffle = false;

    for (let i = 0; i < count; i++) {
      if (newDeck.length === 0) {
        if (newDiscard.length === 0) break;
        newDeck = shuffle(newDiscard);
        newDiscard = [];
        didShuffle = true;
      }
      const card = newDeck.pop();
      if (card) newHand.push(card);
    }
    return { newDeck, newDiscard, newHand, didShuffle };
  }, []);

  const initGame = (boardId: string, playerCount: number) => {
      if (!isMuted) { 
          // Music is already playing from the menu
          playSfx('shuffle');
      }

      const newPlayers: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
          const shuffledStart = shuffle([...STARTING_DECK]);
          const { newDeck, newHand } = drawCards(5, shuffledStart, [], []);
          newPlayers.push({
              id: i, name: `Player ${i + 1}`, deck: newDeck, hand: newHand, discard: [], playArea: [], actions: 1, buys: 1, gold: 0
          });
      }
      
      const selectedBoard = BOARD_SETUPS.find(b => b.id === boardId) || BOARD_SETUPS[0];
      const newSupply: Record<string, number> = {
          copper: 60 - (playerCount * 7), silver: 40, gold: 30, estate: playerCount > 2 ? 12 : 8, duchy: playerCount > 2 ? 12 : 8, province: playerCount > 2 ? 12 : 8, curse: (playerCount - 1) * 10, 
      };
      selectedBoard.cards.forEach(cardId => newSupply[cardId] = 10);

      setPlayers(newPlayers);
      setCurrentPlayerIndex(0);
      setSupply(newSupply);
      setTrash([]);
      setTurnCount(1);
      setTurnPhase('ACTION');
      setGameOver(false);
      const newLog = [`Reign Started: ${selectedBoard.name}`, `${playerCount} Lords have entered the fray.`];
      setLog(newLog);
      setIsDiscardOpen(false);
      setIsTransitioning(false);
      setActionMultiplier(1);
      setInteractionQueue([]);
      setSelectedHandIndices([]);
      setViewingSupplyCard(null);
      setConfirmingCardIndex(null);

      // Force update ref immediately for network calls
      gameStateRef.current = { ...gameStateRef.current, players: newPlayers, supply: newSupply, currentPlayerIndex: 0 };

      if (gameMode === 'ONLINE_HOST') {
          hostConnectionsRef.current.forEach((conn, idx) => conn.send({ type: 'START_GAME', payload: { yourPlayerId: idx + 1 } }));
          // State will be sent by the useEffect broadcast
      }
      setShowGameSetup(false);
  };

  // --- Handlers (UI triggers) ---

  const handleHandCardClick = (index: number) => {
      unlockAudio();

      if (currentInteraction) {
          if (currentInteraction.type === 'HAND_SELECTION' || currentInteraction.type === 'CUSTOM_SELECTION') {
                // If Online, activePlayerIndex logic is slightly different
                // Local or Host: activePlayerIndex is correct.
                // Client: activePlayerIndex must match myPlayerId.
                const isActingPlayer = gameMode === 'LOCAL' || activePlayerIndex === myPlayerId;
                
                if (!isActingPlayer) return;

                const isSelected = selectedHandIndices.includes(index);
                if (isSelected) {
                    setSelectedHandIndices(prev => prev.filter(i => i !== index));
                } else {
                    const card = currentInteraction.type === 'CUSTOM_SELECTION' && currentInteraction.customCards 
                        ? currentInteraction.customCards[index]
                        : activePlayer.hand[index];
                        
                    if (currentInteraction.filter && !currentInteraction.filter(card)) {
                        triggerShake(`${index}-${card.id}`);
                        return;
                    }
                    if (currentInteraction.max !== -1 && selectedHandIndices.length >= currentInteraction.max) {
                        if (currentInteraction.max === 1) {
                            setSelectedHandIndices([index]);
                        } else {
                            triggerShake(`${index}-${card.id}`);
                        }
                        return;
                    }
                    setSelectedHandIndices(prev => [...prev, index]);
                }
          }
          return;
      }

      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      const card = currentPlayer.hand[index];
      const isAction = card.type === CardType.ACTION || card.type === CardType.REACTION;
      
      if (isAction) {
          if (turnPhase === 'BUY') {
              addLog("❌ Cannot play Actions during Buy Phase.");
              addFloatingText("Buy Phase Active", "text-red-500");
              triggerShake(`${index}-${card.id}`);
              return;
          }
          if (currentPlayer.actions <= 0 && actionMultiplier === 1) {
              addLog("❌ You have no Actions remaining.");
              triggerShake(`${index}-${card.id}`);
              return;
          }
          
          if (confirmingCardIndex !== index) {
              setConfirmingCardIndex(index);
              return; 
          }
          setConfirmingCardIndex(null); 
      }

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'PLAY_CARD', cardIndex: index });
      } else {
          executePlayCard(currentPlayerIndex, index);
      }
  };

  const handleSupplyCardClick = (cardId: string) => {
      if (currentInteraction && currentInteraction.type === 'SUPPLY_SELECTION') {
          const card = CARDS[cardId];
          if (currentInteraction.filter && !currentInteraction.filter(card)) {
              addFloatingText("Invalid Selection", "text-red-500");
              return;
          }
           if (supply[cardId] < 1) {
               addFloatingText("Empty Pile", "text-red-500");
               return;
           }
          
          // Resolution Logic
          if (gameMode === 'ONLINE_CLIENT') {
              // Client logic for supply selection
          } else {
              currentInteraction.onResolve([card], []);
              setInteractionQueue(prev => prev.slice(1));
          }
          return;
      }

      const card = CARDS[cardId];
      if (card) {
          setViewingSupplyCard(card);
      }
  };

  const confirmBuyCard = () => {
      if (!viewingSupplyCard) return;
      
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      const cardId = viewingSupplyCard.id;

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'BUY_CARD', cardId });
      } else {
          executeBuyCard(currentPlayerIndex, cardId);
      }
      setViewingSupplyCard(null); 
  };

  const handleConfirmInteraction = () => {
      if (!currentInteraction) return;

      if (currentInteraction.min !== -1 && selectedHandIndices.length < currentInteraction.min) {
          addFloatingText(`Select at least ${currentInteraction.min}`, "text-red-500");
          return;
      }

      // ONLINE CLIENT LOGIC: Send the decision to the host
      if (gameMode === 'ONLINE_CLIENT') {
          clientConnectionRef.current?.send({ 
              type: 'RESOLVE_INTERACTION', 
              payload: { 
                  id: currentInteraction.id, 
                  indices: selectedHandIndices 
              } 
          });
          // Optimistically clear UI
          setSelectedHandIndices([]);
          setInteractionQueue(prev => prev.slice(1));
          return;
      }

      // LOCAL / HOST LOGIC
      let selectedCards: CardDef[] = [];
      if (currentInteraction.type === 'CUSTOM_SELECTION' && currentInteraction.customCards) {
          selectedCards = selectedHandIndices.map(i => currentInteraction.customCards![i]);
      } else {
          selectedCards = selectedHandIndices.map(i => activePlayer.hand[i]);
      }
      
      currentInteraction.onResolve(selectedCards, selectedHandIndices);
      setSelectedHandIndices([]);
      setInteractionQueue(prev => prev.slice(1));
  };

  const handlePlayAllTreasures = () => {
      if (isInteracting) return; 
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'PLAY_ALL_TREASURES' });
      } else {
          executePlayAllTreasures(currentPlayerIndex);
      }
  };

  const handleEndTurn = () => {
      if (isInteracting) return;
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 500);

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'END_TURN' });
      } else {
          executeEndTurn(currentPlayerIndex);
      }
  };

  const handleEnterBuyPhase = () => {
      if (turnPhase === 'ACTION') {
          setTurnPhase('BUY');
          addLog(`${players[currentPlayerIndex].name} enters Buy Phase.`);
          // Host will auto-broadcast this change via useEffect
      }
  };

  // --- Execution Logic (Updated to use REF for latest state) ---

  function executePlayCard(playerIdx: number, cardIdx: number) {
      // NOTE: We fetch current state from REF, ensuring we are not using stale closures from when network listeners were bound
      const currentState = gameStateRef.current;
      const playersList = currentState.players;
      const player = playersList[playerIdx];
      if (!player) return;
      const card = player.hand[cardIdx];
      if (!card) return;

      const isAction = card.type === CardType.ACTION || card.type === CardType.REACTION;
      
      if (isAction && currentState.turnPhase === 'BUY') return; 
      if (isAction && player.actions <= 0 && currentState.actionMultiplier === 1) return;

      if (currentState.gameMode === 'LOCAL' || currentState.gameMode === 'ONLINE_HOST') playSfx('flip');

      if (card.type === CardType.TREASURE && currentState.turnPhase === 'ACTION') {
          setTurnPhase('BUY');
      }

      const newHand = [...player.hand];
      newHand.splice(cardIdx, 1);
      const newPlayArea = [...player.playArea, card];
      
      let newActions = player.actions;
      if (isAction && currentState.actionMultiplier === 1) newActions -= 1;

      let newBuys = player.buys;
      let newGold = player.gold;
      let newDeck = player.deck;
      let newDiscard = player.discard;
      let drawnHand = newHand; 
      const newLog = [...currentState.log];

      const queueInteraction = (interaction: Interaction) => {
          setInteractionQueue(prev => [...prev, interaction]);
      };

      const timesToPlay = (isAction) ? currentState.actionMultiplier : 1;
      
      for(let i=0; i<timesToPlay; i++) {
          newLog.push(`${player.name} plays ${card.name} ${i > 0 ? '(Second Cast)' : ''}`);

          if (isAction) {
              newActions += (card.actions || 0);
              newBuys += (card.buys || 0);
              newGold += (card.gold || 0);
              
              if (card.cards && card.cards > 0) {
                 const res = drawCards(card.cards, newDeck, newDiscard, drawnHand);
                 newDeck = res.newDeck;
                 newDiscard = res.newDiscard;
                 drawnHand = res.newHand;
                 if (res.didShuffle && (currentState.gameMode === 'LOCAL' || currentState.gameMode === 'ONLINE_HOST')) playSfx('shuffle');
              }
          } else if (card.type === CardType.TREASURE) {
              newGold += (card.value || 0);
          }
          
          if (card.id === 'cellar') {
              queueInteraction({
                  id: `cellar-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Cellar',
                  min: 0, max: -1,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Discard & Draw',
                  onResolve: (selected, indices) => {
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const cardsToDiscard = indices.map(idx => p.hand[idx]);
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          const updatedDiscard = [...p.discard, ...cardsToDiscard];
                          const { newDeck: d, newDiscard: disc, newHand: h } = drawCards(indices.length, p.deck, updatedDiscard, remainingHand);
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, deck: d, discard: disc, hand: h } : pl);
                      });
                      addLog(`${player.name} discarded ${selected.length} cards and drew ${selected.length}.`);
                  }
              });
          }
          
          if (card.id === 'chapel') {
              queueInteraction({
                  id: `chapel-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Chapel',
                  min: 0, max: 4,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Trash Cards',
                  onResolve: (selected, indices) => {
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, ...selected]);
                      addLog(`${player.name} trashed ${selected.length} cards.`);
                  }
              });
          }

          if (card.id === 'sentry') {
              const { newDeck: tempDeck, newDiscard: tempDiscard, newHand: drawn } = drawCards(2, newDeck, newDiscard, []);
              newDeck = tempDeck; 
              newDiscard = tempDiscard;
              
              if (drawn.length > 0) {
                  queueInteraction({
                      id: `sentry-trash-${Date.now()}-${i}`,
                      type: 'CUSTOM_SELECTION',
                      customCards: drawn,
                      source: 'Sentry (Trash)',
                      min: 0, max: 2,
                      targetPlayerIndex: playerIdx,
                      confirmLabel: 'Trash Selected',
                      onResolve: (trashed, trashedIndices) => {
                          setTrash(prev => [...prev, ...trashed]);
                          const keptAfterTrash = drawn.filter((_, idx) => !trashedIndices.includes(idx));
                          if (trashed.length > 0) addLog(`${player.name} trashed ${trashed.length} cards with Sentry.`);
                          
                          if (keptAfterTrash.length > 0) {
                              queueInteraction({
                                  id: `sentry-discard-${Date.now()}-${i}`,
                                  type: 'CUSTOM_SELECTION',
                                  customCards: keptAfterTrash,
                                  source: 'Sentry (Discard)',
                                  min: 0, max: keptAfterTrash.length,
                                  targetPlayerIndex: playerIdx,
                                  confirmLabel: 'Discard Selected',
                                  onResolve: (discarded, discardedIndices) => {
                                      const keptFinal = keptAfterTrash.filter((_, idx) => !discardedIndices.includes(idx));
                                      
                                      setPlayers(prevPlayers => {
                                          const p = prevPlayers[playerIdx];
                                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                              ...pl, 
                                              discard: [...pl.discard, ...discarded],
                                              deck: [...pl.deck, ...keptFinal] 
                                          } : pl);
                                      });
                                      if (discarded.length > 0) addLog(`${player.name} discarded ${discarded.length} cards.`);
                                      if (keptFinal.length > 0) addLog(`${player.name} put ${keptFinal.length} cards back on deck.`);
                                  }
                              });
                          }
                      }
                  });
              }
          }

          if (card.id === 'library') {
               const currentHandSize = drawnHand.length;
               const needed = 7 - currentHandSize;
               if (needed > 0) {
                   const res = drawCards(needed, newDeck, newDiscard, drawnHand);
                   newDeck = res.newDeck;
                   newDiscard = res.newDiscard;
                   drawnHand = res.newHand;
                   newLog.push(`${player.name} drew up to 7 cards.`);
               }
          }

          if (card.id === 'harbinger') {
              if (newDiscard.length > 0) {
                  queueInteraction({
                      id: `harbinger-${Date.now()}-${i}`,
                      type: 'CUSTOM_SELECTION',
                      source: 'Harbinger',
                      customCards: newDiscard, 
                      min: 1, max: 1,
                      targetPlayerIndex: playerIdx,
                      confirmLabel: 'Topdeck',
                      onResolve: (selected, indices) => {
                          const selectedCard = selected[0];
                          setPlayers(prevPlayers => {
                              const p = prevPlayers[playerIdx];
                              const realDiscard = [...p.discard];
                              const removeIdx = realDiscard.findIndex(c => c.id === selectedCard.id);
                              if (removeIdx > -1) realDiscard.splice(removeIdx, 1);
                              
                              return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                  ...pl, 
                                  discard: realDiscard,
                                  deck: [...pl.deck, selectedCard] 
                              } : pl);
                          });
                          addLog(`${player.name} put ${selectedCard.name} from discard onto deck.`);
                      }
                  });
              }
          }

          if (card.id === 'vassal') {
             const res = drawCards(1, newDeck, newDiscard, []);
             if (res.newHand.length > 0) {
                 const revealed = res.newHand[0];
                 newDeck = res.newDeck;
                 newDiscard = res.newDiscard;
                 
                 newDiscard = [...newDiscard, revealed];
                 newLog.push(`${player.name} Vassal reveals: ${revealed.name}`);

                 if (revealed.type === CardType.ACTION || revealed.type === CardType.REACTION) {
                     queueInteraction({
                         id: `vassal-play-${Date.now()}-${i}`,
                         type: 'CONFIRMATION',
                         source: `Vassal (${revealed.name})`,
                         min: 0, max: 0,
                         targetPlayerIndex: playerIdx,
                         confirmLabel: 'Play It',
                         filterMessage: `Play ${revealed.name} from discard?`,
                         onResolve: () => {
                             setPlayers(prevPlayers => {
                                 const p = prevPlayers[playerIdx];
                                 const disc = [...p.discard];
                                 disc.pop(); 
                                 return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                     ...pl, 
                                     discard: disc,
                                     hand: [...pl.hand, revealed] 
                                 } : pl);
                             });
                             setTimeout(() => {
                                 setPlayers(current => {
                                     const p = current[playerIdx];
                                     executePlayCard(playerIdx, p.hand.length - 1);
                                     return current;
                                 });
                             }, 100);
                         }
                     });
                 }
             }
          }

          if (card.id === 'workshop') {
              queueInteraction({
                  id: `workshop-${Date.now()}-${i}`,
                  type: 'SUPPLY_SELECTION',
                  source: 'Workshop',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.cost <= 4,
                  filterMessage: 'Cost up to 4',
                  onResolve: (selected) => {
                      const c = selected[0];
                      setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                      setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, discard: [...pl.discard, c] } : pl));
                      addLog(`${player.name} gained ${c.name} via Workshop.`);
                  }
              });
          }

          if (card.id === 'artisan') {
             queueInteraction({
                  id: `artisan-gain-${Date.now()}-${i}`,
                  type: 'SUPPLY_SELECTION',
                  source: 'Artisan',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.cost <= 5,
                  filterMessage: 'Cost up to 5',
                  onResolve: (selected) => {
                      const c = selected[0];
                      setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                      setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: [...pl.hand, c] } : pl));
                      addLog(`${player.name} gained ${c.name} to hand.`);
                      
                      queueInteraction({
                          id: `artisan-put-${Date.now()}-${i}`,
                          type: 'HAND_SELECTION',
                          source: 'Artisan (Put back)',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          confirmLabel: 'Put on Deck',
                          onResolve: (sel, ind) => {
                              setPlayers(prevPlayers => {
                                  const p = prevPlayers[playerIdx];
                                  const cardToTop = p.hand[ind[0]];
                                  const remainingHand = p.hand.filter((_, ix) => ix !== ind[0]);
                                  return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, deck: [...pl.deck, cardToTop] } : pl);
                              });
                              addLog(`${player.name} put a card onto their deck.`);
                          }
                      });
                  }
              });
          }

          if (card.id === 'mine') {
               queueInteraction({
                  id: `mine-trash-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Mine',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.type === CardType.TREASURE,
                  filterMessage: 'Select a Treasure',
                  confirmLabel: 'Trash & Upgrade',
                  onResolve: (selected, indices) => {
                      const trashedCard = selected[0];
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, trashedCard]);
                      addLog(`${player.name} trashed ${trashedCard.name}.`);
                      
                      queueInteraction({
                          id: `mine-gain-${Date.now()}-${i}`,
                          type: 'SUPPLY_SELECTION',
                          source: 'Mine',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          filter: (c) => c.type === CardType.TREASURE && c.cost <= trashedCard.cost + 3,
                          filterMessage: `Treasure cost max ${trashedCard.cost + 3}`,
                          onResolve: (gained) => {
                              const c = gained[0];
                              setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                              setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: [...pl.hand, c] } : pl));
                              addLog(`${player.name} mined ${c.name} into hand.`);
                          }
                      });
                  }
              });
          }

          if (card.id === 'remodel') {
              queueInteraction({
                  id: `remodel-trash-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Remodel',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Trash & Remodel',
                  onResolve: (selected, indices) => {
                      const trashedCard = selected[0];
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, trashedCard]);
                      addLog(`${player.name} trashed ${trashedCard.name}.`);
                      
                      queueInteraction({
                          id: `remodel-gain-${Date.now()}-${i}`,
                          type: 'SUPPLY_SELECTION',
                          source: 'Remodel',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          filter: (c) => c.cost <= trashedCard.cost + 2,
                          filterMessage: `Cost max ${trashedCard.cost + 2}`,
                          onResolve: (gained) => {
                              const c = gained[0];
                              setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                              setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, discard: [...pl.discard, c] } : pl));
                              addLog(`${player.name} remodeled into ${c.name}.`);
                          }
                      });
                  }
              });
          }
          
          if (card.id === 'moneylender') {
              queueInteraction({
                  id: `moneylender-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Moneylender',
                  min: 0, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.id === 'copper',
                  filterMessage: 'Trash a Copper (Optional)',
                  confirmLabel: 'Confirm',
                  onResolve: (selected, indices) => {
                      if (selected.length > 0) {
                          setPlayers(prevPlayers => {
                              const p = prevPlayers[playerIdx];
                              const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                              return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, gold: pl.gold + 3 } : pl);
                          });
                          setTrash(prev => [...prev, ...selected]);
                          addLog(`${player.name} trashed a Copper for +3 Gold.`);
                      } else {
                          addLog(`${player.name} chose not to trash a Copper.`);
                      }
                  }
              });
          }
          
          if (card.id === 'poacher') {
               const emptyPiles = Object.values(currentState.supply).filter(v => v === 0).length;
               if (emptyPiles > 0) {
                   const discardCount = Math.min(emptyPiles, drawnHand.length);
                   queueInteraction({
                       id: `poacher-${Date.now()}-${i}`,
                       type: 'HAND_SELECTION',
                       source: 'Poacher',
                       min: discardCount, max: discardCount,
                       targetPlayerIndex: playerIdx,
                       confirmLabel: `Discard ${discardCount} Cards`,
                       onResolve: (selected, indices) => {
                           setPlayers(prevPlayers => {
                               const p = prevPlayers[playerIdx];
                               const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                               const updatedDiscard = [...p.discard, ...selected];
                               return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, discard: updatedDiscard } : pl);
                           });
                           addLog(`${player.name} discarded ${discardCount} cards due to empty piles.`);
                       }
                   });
               }
          }

          if (card.id === 'militia') {
              playersList.forEach((p, pIdx) => {
                  if (pIdx === playerIdx) return;
                  if (p.hand.length <= 3) return; 
                  if (p.hand.some(c => c.id === 'moat')) {
                      newLog.push(`${p.name} blocks Militia with Moat.`);
                      return;
                  }

                  const discardCount = p.hand.length - 3;
                  queueInteraction({
                      id: `militia-${p.name}-${Date.now()}`,
                      type: 'HAND_SELECTION',
                      source: `Militia Attack (${p.name})`,
                      targetPlayerIndex: pIdx,
                      min: discardCount, max: discardCount,
                      confirmLabel: 'Discard Down to 3',
                      onResolve: (selected, indices) => {
                          setPlayers(prevPlayers => {
                              const victim = prevPlayers[pIdx];
                              const remHand = victim.hand.filter((_, idx) => !indices.includes(idx));
                              const upDiscard = [...victim.discard, ...selected];
                              return prevPlayers.map((pl, idx) => idx === pIdx ? { ...pl, hand: remHand, discard: upDiscard } : pl);
                          });
                          addLog(`${p.name} discarded down to 3 cards.`);
                      }
                  });
              });
          }

          if (card.id === 'bandit') {
               playersList.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   if (p.hand.some(c => c.id === 'moat')) {
                       newLog.push(`${p.name} blocks Bandit with Moat.`);
                       return;
                   }
                   
                   queueInteraction({
                       id: `bandit-${p.name}-${Date.now()}`,
                       type: 'CONFIRMATION',
                       source: `Bandit Attack (${p.name})`,
                       min: 0, max: 0,
                       targetPlayerIndex: pIdx, 
                       confirmLabel: 'Reveal Cards',
                       filterMessage: `${player.name} plays Bandit. Reveal top 2 cards?`,
                       onResolve: () => {
                           setPlayers(prevPlayers => {
                               const victim = prevPlayers[pIdx];
                               const { newDeck: vDeck, newDiscard: vDiscard, newHand: revealed } = drawCards(2, victim.deck, victim.discard, []);
                               
                               const treasureToTrash = revealed.find(c => c.type === CardType.TREASURE && c.id !== 'copper');
                               const kept = revealed.filter(c => c !== treasureToTrash);
                               
                               if (treasureToTrash) {
                                   setTrash(t => [...t, treasureToTrash]);
                                   addLog(`${victim.name} trashed ${treasureToTrash.name} due to Bandit.`);
                               } else {
                                   addLog(`${victim.name} revealed no trashable treasures.`);
                               }
                               
                               return prevPlayers.map((pl, idx) => idx === pIdx ? {
                                   ...pl,
                                   deck: vDeck,
                                   discard: [...vDiscard, ...kept]
                               } : pl);
                           });
                       }
                   });
               });
          }

          if (card.id === 'council_room') {
               playersList.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   setPlayers(prevPlayers => {
                       const other = prevPlayers[pIdx];
                       const { newDeck: d, newDiscard: disc, newHand: h } = drawCards(1, other.deck, other.discard, other.hand);
                       return prevPlayers.map((pl, idx) => idx === pIdx ? { ...pl, deck: d, discard: disc, hand: h } : pl);
                   });
                   newLog.push(`${p.name} draws a card.`);
               });
          }
          
          if (card.id === 'bureaucrat') {
               const silver = CARDS['silver'];
               if (currentState.supply['silver'] > 0) {
                   setSupply(prev => ({ ...prev, silver: prev.silver - 1 }));
                   newDeck = [...newDeck, silver];
                   addLog(`${player.name} put a Silver on their deck.`);
               }
               playersList.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   if (p.hand.some(c => c.id === 'moat')) {
                       newLog.push(`${p.name} blocks Bureaucrat with Moat.`);
                       return;
                   }
                   
                   const validVictory = p.hand.filter(c => c.type === CardType.VICTORY);
                   
                   if (validVictory.length > 0) {
                       queueInteraction({
                           id: `bureaucrat-${p.name}-${Date.now()}`,
                           type: 'HAND_SELECTION',
                           source: `Bureaucrat Attack (${p.name})`,
                           min: 1, max: 1,
                           targetPlayerIndex: pIdx,
                           filter: (c) => c.type === CardType.VICTORY,
                           filterMessage: 'Put a Victory card on your deck',
                           confirmLabel: 'Topdeck',
                           onResolve: (selected, indices) => {
                               const c = selected[0];
                               setPlayers(prevPlayers => {
                                   const pl = prevPlayers[pIdx];
                                   const remHand = pl.hand.filter((_, idx) => !indices.includes(idx));
                                   return prevPlayers.map((u, i) => i === pIdx ? { ...u, hand: remHand, deck: [...u.deck, c] } : u);
                               });
                               addLog(`${p.name} put a ${c.name} on their deck.`);
                           }
                       });
                   } else {
                       addLog(`${p.name} shows a hand with no Victory cards.`);
                   }
               });
          }

          if (card.id === 'throne_room') {
              addLog(`> ${player.name} must choose an Action to duplicate.`);
              setActionMultiplier(2); 
          } else if (isAction) {
              setActionMultiplier(1);
          }
      }

      let updatedPlayers = playersList.map((p, i) => i === playerIdx ? {
          ...p, hand: drawnHand, playArea: newPlayArea, actions: newActions, buys: newBuys, gold: newGold, deck: newDeck, discard: newDiscard
      } : p);

      if (card.id === 'witch' && currentState.supply['curse'] > 0) {
         let cursesLeft = currentState.supply['curse'];
         for(let i=0; i<timesToPlay; i++) {
             updatedPlayers = updatedPlayers.map((p, pIdx) => {
                 if (pIdx === playerIdx) return p;
                 if (p.hand.some(c => c.id === 'moat')) {
                     if(i===0) newLog.push(`${p.name} blocks with Moat.`);
                     return p;
                 }
                 if (cursesLeft > 0) {
                     cursesLeft--;
                     newLog.push(`${p.name} gains a Curse.`);
                     return { ...p, discard: [...p.discard, CARDS['curse']] };
                 }
                 return p;
             });
         }
         setSupply(prev => ({ ...prev, curse: cursesLeft }));
      }
      
      setPlayers(updatedPlayers);
      if (currentState.gameMode === 'LOCAL') setLog(newLog);
      
      // Host automatically broadcasts via useEffect loop
  }

  function executeBuyCard(playerIdx: number, cardId: string) {
      const currentState = gameStateRef.current;
      const player = currentState.players[playerIdx];
      const card = CARDS[cardId];
      if (!card) return;
      
      if ((currentState.supply[cardId] || 0) < 1) {
          addLog("Cannot buy: Pile is empty.");
          return;
      }
      if (player.buys < 1) {
          addLog("Cannot buy: No buys remaining.");
          return;
      }
      if (player.gold < card.cost) {
          addLog("Cannot buy: Insufficient gold.");
          return;
      }

      setTurnPhase('BUY');

      if (currentState.gameMode === 'LOCAL' || currentState.gameMode === 'ONLINE_HOST') playSfx('buy');

      const newSupply = { ...currentState.supply, [cardId]: currentState.supply[cardId] - 1 };
      setSupply(newSupply);

      const newPlayers = currentState.players.map((p, idx) => {
          if (idx !== playerIdx) return p;
          return {
              ...p,
              gold: p.gold - card.cost,
              buys: p.buys - 1,
              discard: [...p.discard, card]
          };
      });
      setPlayers(newPlayers);

      const newLog = [...currentState.log, `${player.name} bought ${card.name}.`];
      setLog(newLog);

      if (checkGameOver(newSupply)) {
          setGameOver(true);
      }
      // Host automatically broadcasts via useEffect loop
  }

  function executePlayAllTreasures(playerIdx: number) {
      const currentState = gameStateRef.current;
      const player = currentState.players[playerIdx];
      const treasures = player.hand.filter(c => c.type === CardType.TREASURE);
      if (treasures.length === 0) return;

      setTurnPhase('BUY');

      if (currentState.gameMode === 'LOCAL' || currentState.gameMode === 'ONLINE_HOST') playSfx('buy');

      const totalValue = treasures.reduce((sum, c) => sum + (c.value || 0), 0);
      const newHand = player.hand.filter(c => c.type !== CardType.TREASURE);
      const newPlayArea = [...player.playArea, ...treasures];

      const newPlayers = currentState.players.map((p, idx) => {
          if (idx !== playerIdx) return p;
          return {
              ...p,
              hand: newHand,
              playArea: newPlayArea,
              gold: p.gold + totalValue
          };
      });
      setPlayers(newPlayers);

      const newLog = [...currentState.log, `${player.name} played all treasures (+${totalValue} Gold).`];
      setLog(newLog);
      // Host automatically broadcasts via useEffect loop
  }

  function executeEndTurn(playerIdx: number) {
      setIsEndingTurn(true);
      const currentState = gameStateRef.current;
      const player = currentState.players[playerIdx];

      const cardsToDiscard = [...player.hand, ...player.playArea];
      const newDiscard = [...player.discard, ...cardsToDiscard];
      
      const { newDeck, newDiscard: deckRefilledDiscard, newHand } = drawCards(5, player.deck, newDiscard, []);
      
      const updatedPlayer = {
          ...player,
          hand: newHand,
          deck: newDeck,
          discard: deckRefilledDiscard,
          playArea: [],
          actions: 1,
          buys: 1,
          gold: 0
      };

      const nextPlayerIndex = (playerIdx + 1) % currentState.players.length;
      const nextTurnCount = nextPlayerIndex === 0 ? currentState.turnCount + 1 : currentState.turnCount;
      
      const newPlayers = currentState.players.map((p, i) => i === playerIdx ? updatedPlayer : p);
      
      setPlayers(newPlayers);
      
      setTimeout(() => {
          setCurrentPlayerIndex(nextPlayerIndex);
          setTurnCount(nextTurnCount);
          setActionMultiplier(1);
          setInteractionQueue([]); 
          setIsEndingTurn(false);
          setTurnPhase('ACTION'); 
          setConfirmingCardIndex(null); 
          
          if (currentState.gameMode === 'LOCAL') {
              setIsTransitioning(true);
          }
          
          const newLog = [...currentState.log, `${player.name} ended turn`];
          setLog(newLog);
          // Host automatically broadcasts via useEffect loop
      }, 500);
  }

  // --- Render ---

  // NEW: AAA Boot Sequence Loading Screen
  if (bootPhase === 'LOADING') {
      return (
          // The main container background is intentionally transparent to reveal the box art from index.html
          <div 
             className="min-h-screen flex flex-col justify-end pb-12 p-0 relative overflow-hidden select-none bg-boot"
             style={{ transformOrigin: 'center center' }}
          >
              <div className="atmosphere-noise"></div>
              <div className="vignette"></div>
              <EmberParticles />
              
              {/* Bottom Area: Tips & Bar */}
              <div className="relative z-50 w-full flex flex-col items-center px-8 md:px-32 lg:px-64 gap-6 animate-in fade-in slide-in-from-bottom-5 duration-1000">
                  
                  {/* Tip / Lore Container */}
                  <div className="h-8 flex items-center justify-center text-center max-w-4xl">
                      <p className="text-[#e6c888] font-serif text-sm md:text-lg italic tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-pulse" key={loadingText}>
                          {loadingText}
                      </p>
                  </div>

                  {/* Ornate Loading Bar */}
                  <div className="w-full max-w-2xl flex flex-col gap-2">
                      <div className="flex justify-between text-[#8a6e38] font-sans font-bold text-[10px] uppercase tracking-[0.2em] px-1">
                          <span>Loading Assets</span>
                          <span>{Math.floor(loadingProgress)}%</span>
                      </div>
                      <div className="w-full h-1 bg-black/50 border border-[#3e2723] relative rounded-full overflow-hidden shadow-heavy backdrop-blur-sm">
                          <div 
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#8a6e38] via-[#ffd700] to-[#e6c888] shadow-[0_0_15px_rgba(197,160,89,0.6)] transition-all duration-100 ease-out"
                              style={{ width: `${loadingProgress}%` }}
                          >
                              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px] opacity-70"></div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }
  
  if (bootPhase === 'INTRO') {
    return (
        <div 
          className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-menu w-full h-full animate-in fade-in duration-1000"
        >
           {/* Global Atmosphere */}
           <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent pointer-events-none z-10"></div>
           <EmberParticles />
           
           <div className="relative z-50 flex flex-col items-center gap-8 mb-20 animate-in zoom-in-50 duration-1000">
               {/* Subtitle floating above menu */}
               <div className="mb-4 text-center bg-black/60 backdrop-blur-md p-4 rounded-xl border border-[#c5a059]/30 shadow-heavy">
                   <p className="text-[#e6c888] font-serif text-lg md:text-xl tracking-[0.4em] uppercase font-bold text-emboss drop-shadow-lg">
                       A Deck-Building Conquest
                   </p>
               </div>
               
               <button 
                  onClick={handleEnterRealm}
                  className="bg-[#5e1b1b] hover:bg-[#7f1d1d] text-[#e6c888] font-serif font-bold text-2xl py-6 px-16 border-2 border-[#8a6e38] hover:border-[#ffd700] shadow-[0_0_50px_rgba(234,88,12,0.4)] hover:shadow-[0_0_80px_rgba(255,215,0,0.6)] uppercase tracking-[0.2em] transition-all transform hover:scale-105 active:scale-95 rounded-sm flex items-center gap-4 group"
               >
                   <Swords className="text-[#ffd700] group-hover:rotate-12 transition-transform" size={28} />
                   <span>Let the adventures begin</span>
                   <Swords className="text-[#ffd700] group-hover:-rotate-12 transition-transform" size={28} />
               </button>
           </div>
        </div>
    );
  }

  // --- SAFEGUARD FOR MULTIPLAYER ---
  // If game has started but player state hasn't arrived from network, show loading screen
  // Only applies if we are NOT in the setup phase (because local/host setup also has empty players initially)
  if (hasStarted && players.length === 0 && !showGameSetup) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-black p-4 text-center select-none" onClick={unlockAudio}>
              <Loader className="animate-spin text-[#e6c888] mb-4" size={48} />
              <h2 className="text-xl text-[#e6c888] font-serif tracking-widest">Awaiting Realm State...</h2>
              <button onClick={exitGame} className="mt-8 text-red-500 hover:text-red-400 text-xs uppercase font-bold flex items-center gap-2">
                 <LogOut size={14} /> Abort
              </button>
          </div>
      );
  }

  // --- MENU RENDER ---
  if (bootPhase === 'MENU' && !hasStarted) {
      return (
          <div className="min-h-screen bg-menu flex items-center justify-center p-4" onClick={unlockAudio}>
              <div className="max-w-4xl w-full bg-black/80 backdrop-blur border border-[#8a6e38] rounded-xl p-8 shadow-heavy">
                  <h1 className="text-5xl font-serif text-center text-[#e6c888] mb-8 drop-shadow-lg">WICKINION</h1>
                  
                  {!showOnlineMenu ? (
                      <div className="space-y-8">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <button onClick={() => { setGameMode('LOCAL'); setShowGameSetup(true); }} className="bg-[#2c1e16] p-6 rounded border border-[#5d4037] hover:bg-[#3e2723] text-left">
                                   <div className="flex items-center gap-2 text-[#e6c888] font-serif text-xl mb-2"><Users /> Local Game</div>
                                   <p className="text-stone-500 text-sm">Pass & Play on this device.</p>
                               </button>
                               <button onClick={() => setShowOnlineMenu(true)} className="bg-[#0f172a] p-6 rounded border border-slate-800 hover:bg-[#1e293b] text-left">
                                   <div className="flex items-center gap-2 text-blue-400 font-serif text-xl mb-2"><Wifi /> Online Game</div>
                                   <p className="text-slate-500 text-sm">Host or Join a lobby.</p>
                               </button>
                           </div>

                           {showGameSetup && (
                               <div className="animate-in fade-in slide-in-from-top-4 space-y-6 pt-6 border-t border-[#8a6e38]/30">
                                   <div>
                                       <label className="text-[#8a6e38] text-xs uppercase font-bold mb-2 block">Setup</label>
                                       <div className="flex gap-2 flex-wrap">
                                            {BOARD_SETUPS.map(b => (
                                                <button key={b.id} onClick={() => setSelectedBoardId(b.id)} className={`px-4 py-2 rounded border text-sm ${selectedBoardId === b.id ? 'bg-[#e6c888] text-black border-[#ffd700]' : 'bg-black/50 text-stone-400 border-stone-700'}`}>
                                                    {b.name}
                                                </button>
                                            ))}
                                       </div>
                                       <p className="text-stone-500 text-xs mt-2 italic">{BOARD_SETUPS.find(b => b.id === selectedBoardId)?.description}</p>
                                   </div>
                                   <div>
                                       <label className="text-[#8a6e38] text-xs uppercase font-bold mb-2 block">Players</label>
                                       <div className="flex gap-2">
                                           {[2,3,4].map(n => (
                                               <button key={n} onClick={() => setPlayerCountMode(n)} className={`w-10 h-10 rounded-full border flex items-center justify-center font-serif ${playerCountMode === n ? 'bg-[#e6c888] text-black border-[#ffd700]' : 'bg-black/50 text-stone-400 border-stone-700'}`}>{n}</button>
                                           ))}
                                       </div>
                                   </div>
                                   <button onClick={() => initGame(selectedBoardId, playerCountMode)} className="w-full py-4 bg-[#5e1b1b] hover:bg-[#7f1d1d] text-[#e6c888] font-serif text-xl uppercase tracking-widest border border-[#8a6e38]">Enter Realm</button>
                               </div>
                           )}
                      </div>
                  ) : (
                      <div className="space-y-6">
                          <button onClick={() => setShowOnlineMenu(false)} className="text-stone-500 hover:text-white flex items-center gap-2 text-sm uppercase"><ArrowRight className="rotate-180" size={14} /> Back</button>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                               <div className="bg-slate-900/50 p-6 rounded border border-slate-700">
                                   <h3 className="text-blue-400 font-serif text-lg mb-4">Host</h3>
                                   {!peerId ? (
                                       <button onClick={initHost} className="w-full py-2 bg-blue-900/50 text-blue-200 border border-blue-800 rounded">Start Lobby</button>
                                   ) : (
                                       <div className="space-y-4">
                                           <div className="bg-black p-2 rounded text-center font-mono text-white select-all">{peerId}</div>
                                           <p className="text-center text-stone-500 text-xs">Waiting for players ({connectedPeers.length})...</p>
                                           {connectedPeers.length > 0 && <button onClick={() => initGame(selectedBoardId, connectedPeers.length + 1)} className="w-full py-2 bg-blue-600 text-white rounded animate-pulse">Start Game</button>}
                                       </div>
                                   )}
                               </div>
                               <div className="bg-slate-900/50 p-6 rounded border border-slate-700">
                                   <h3 className="text-emerald-400 font-serif text-lg mb-4">Join</h3>
                                   <input value={hostIdInput} onChange={e => setHostIdInput(e.target.value)} placeholder="Host ID" className="w-full bg-black border border-slate-700 p-2 rounded text-white mb-4 outline-none focus:border-emerald-500" />
                                   <button onClick={joinGame} disabled={isConnecting || !hostIdInput} className="w-full py-2 bg-emerald-900/50 text-emerald-200 border border-emerald-800 rounded disabled:opacity-50">{isConnecting ? 'Connecting...' : 'Connect'}</button>
                                   <p className="text-center text-stone-500 text-xs mt-2">{lobbyStatus}</p>
                               </div>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      );
  }

  // --- GAME RENDER ---
  return (
      <div className="min-h-screen bg-[#1c1917] overflow-hidden flex flex-col font-sans select-none relative" onClick={unlockAudio}>
           {/* TOP BAR: Resources & Info */}
           <div className="h-16 md:h-20 bg-[#0f0a06] border-b border-[#3e2723] flex items-center justify-between px-4 z-20 relative shadow-heavy">
                <div className="flex items-center gap-4">
                    <button onClick={() => setGameMenuOpen(true)} className="p-2 text-[#8a6e38] hover:text-[#e6c888]"><Menu /></button>
                    <div className="hidden md:block">
                        <div className="text-[#8a6e38] text-[10px] uppercase tracking-widest">Turn {turnCount}</div>
                        <div className="text-[#e6c888] font-serif text-lg">{currentPlayer.name}</div>
                    </div>
                </div>
                
                {/* Resources */}
                <div className="flex gap-4 md:gap-8 absolute left-1/2 -translate-x-1/2 top-2 md:top-4">
                     <ResourceCounter value={currentPlayer.actions} label="Actions" icon={<Zap size={12} />} />
                     <ResourceCounter value={currentPlayer.buys} label="Buys" icon={<ShoppingBag size={12} />} />
                     <ResourceCounter value={currentPlayer.gold} label="Coins" icon={<Coins size={12} />} />
                </div>

                <div className="flex items-center gap-4">
                     {gameMode === 'ONLINE_CLIENT' && <div className="text-xs text-blue-400 flex items-center gap-1"><Wifi size={12} /> Client</div>}
                     {gameMode === 'ONLINE_HOST' && <div className="text-xs text-emerald-400 flex items-center gap-1"><Wifi size={12} /> Host</div>}
                     <button onClick={() => setIsLogOpen(!isLogOpen)} className={`p-2 ${isLogOpen ? 'text-[#e6c888]' : 'text-[#8a6e38]'}`}><Scroll /></button>
                </div>
           </div>

           {/* MAIN AREA */}
           <div className="flex-1 relative flex flex-col overflow-hidden">
                
                {/* Opponents Strip (Top) */}
                <div className="h-16 bg-black/30 flex items-center justify-center gap-4 px-4 overflow-x-auto">
                    {players.map((p, i) => i !== currentPlayerIndex && (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1 rounded border ${activePlayerIndex === i ? 'border-[#e6c888] bg-[#e6c888]/10' : 'border-transparent opacity-50'}`}>
                             <User size={14} className="text-[#8a6e38]" />
                             <span className="text-[#e6c888] text-xs">{p.name}</span>
                             <div className="flex gap-2 text-[10px] text-stone-400">
                                 <span className="flex items-center gap-0.5"><Layers size={10} /> {p.deck.length}</span>
                                 <span className="flex items-center gap-0.5"><Copy size={10} /> {p.hand.length}</span>
                             </div>
                        </div>
                    ))}
                </div>

                {/* Supply & Play Area */}
                <div className="flex-1 flex overflow-hidden">
                     {/* Supply Grid */}
                     <div className="flex-1 p-4 grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 content-start overflow-y-auto">
                          {Object.entries(supply).map(([id, count]) => {
                              const card = CARDS[id];
                              if(!card) return null;
                              return <CardDisplay key={id} card={card} count={count} small onClick={() => handleSupplyCardClick(id)} disabled={count === 0} />;
                          })}
                     </div>
                </div>

                {/* Play Area (Overlay on bottom half) */}
                <div className="h-48 md:h-64 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 w-full pointer-events-none flex items-end justify-center pb-24 md:pb-32 px-4 gap-[-40px]">
                     {currentPlayer.playArea.map((c, i) => (
                         <div key={i} style={{ transform: `translateX(${i * -40}px) rotate(${(i - currentPlayer.playArea.length/2) * 2}deg)` }} className="origin-bottom">
                             <CardDisplay card={c} small />
                         </div>
                     ))}
                </div>

                {/* Floating Texts */}
                {floatingTexts.map(ft => (
                    <div key={ft.id} className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-black ${ft.color} animate-bounce pointer-events-none z-50 text-shadow-heavy`}>
                        {ft.text}
                    </div>
                ))}

           </div>

           {/* BOTTOM: HAND */}
           <div className="h-40 md:h-56 bg-[#0f0a06] border-t border-[#3e2723] relative flex items-end justify-center pb-4 z-30">
                <div className="flex items-end justify-center -space-x-8 md:-space-x-12 hover:space-x-1 transition-all duration-300 px-4 pb-2 md:pb-6 overflow-x-visible">
                     {currentPlayer.hand.map((card, i) => (
                         <div key={i} className={`transition-transform duration-200 hover:-translate-y-8 z-10 ${selectedHandIndices.includes(i) ? '-translate-y-12 z-20 ring-2 ring-[#e6c888] rounded-lg' : ''}`}>
                             <CardDisplay 
                                 card={card} 
                                 onClick={() => handleHandCardClick(i)} 
                                 disabled={!isMyTurn && !isInteracting}
                                 selected={selectedHandIndices.includes(i)}
                                 shake={shakingCardId === `${i}-${card.id}`}
                             />
                         </div>
                     ))}
                </div>
                
                {/* Action Buttons */}
                <div className="absolute right-4 bottom-4 flex flex-col gap-2">
                     {isMyTurn && !isInteracting && (
                         <>
                            <button onClick={handlePlayAllTreasures} className="bg-[#e6c888] hover:bg-[#ffd700] text-black font-bold p-3 rounded-full shadow-lg" title="Play Treasures">
                                <Coins />
                            </button>
                            <button onClick={handleEndTurn} className="bg-[#5e1b1b] hover:bg-[#7f1d1d] text-white font-bold p-3 rounded-full shadow-lg" title="End Turn">
                                <SkipForward />
                            </button>
                         </>
                     )}
                     {isInteracting && (
                         <button onClick={handleConfirmInteraction} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg animate-pulse uppercase tracking-widest">
                             {currentInteraction?.confirmLabel || 'Confirm'}
                         </button>
                     )}
                </div>
           </div>

           {/* LOG OVERLAY */}
           {isLogOpen && (
               <div className="absolute right-0 top-16 bottom-40 w-80 bg-black/90 border-l border-[#3e2723] p-4 overflow-y-auto z-40 font-mono text-xs text-stone-300">
                   {log.map((entry, i) => <div key={i} className="mb-1 border-b border-white/5 pb-1">{entry}</div>)}
                   <div ref={logEndRef} />
               </div>
           )}

           {/* CARD PREVIEW / BUY OVERLAY */}
           {viewingSupplyCard && (
               <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4" onClick={() => setViewingSupplyCard(null)}>
                   <div className="flex flex-col items-center gap-6 animate-in zoom-in-90" onClick={e => e.stopPropagation()}>
                       <CardDisplay card={viewingSupplyCard} />
                       {isMyTurn && turnPhase !== 'ACTION' && (
                           <button 
                              onClick={confirmBuyCard}
                              disabled={currentPlayer.gold < viewingSupplyCard.cost || currentPlayer.buys < 1 || supply[viewingSupplyCard.id] === 0}
                              className="bg-[#e6c888] disabled:opacity-50 disabled:grayscale text-black font-bold px-8 py-3 rounded uppercase tracking-widest shadow-heavy hover:scale-105 transition-transform"
                           >
                              Buy ({viewingSupplyCard.cost})
                           </button>
                       )}
                   </div>
               </div>
           )}
           
           {/* INTERACTION MESSAGE */}
           {isInteracting && (
               <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-black/80 border border-[#e6c888] px-8 py-4 rounded-lg z-50 text-center pointer-events-none">
                   <h3 className="text-[#e6c888] font-serif text-xl">{currentInteraction?.source}</h3>
                   <p className="text-white">{currentInteraction?.filterMessage || 'Make your selection'}</p>
               </div>
           )}
      </div>
  );
}