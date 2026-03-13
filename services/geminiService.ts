import { GoogleGenAI } from "@google/genai";
import { Player, Identity } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getTacticalAdvice = async (
  player: Player,
  allPlayers: Player[],
  logs: string[]
): Promise<string> => {
  if (!process.env.API_KEY) {
    return "天机不可泄露 (API Key 缺失)";
  }

  const handSummary = player.hand.map(c => c.name).join(', ');
  const recentLogs = logs.slice(-8).join('\n');
  
  // Construct board state description
  const boardState = allPlayers.map(p => {
    if (p.id === player.id) return null;
    if (p.isDead) return `- 玩家${p.id} (${p.hero.name}): 阵亡 (身份: ${p.identity})`;
    return `- 玩家${p.id} (${p.hero.name}): ${p.hp}/${p.maxHp}血, ${p.hand.length}手牌, 身份: ${p.isRevealed ? p.identity : '未知'}`;
  }).filter(Boolean).join('\n');

  const prompt = `
    你现在是三国时期的诸葛亮（孔明）。用户正在玩《三国杀》五人身份局。
    
    【我方情报】
    - 武将: ${player.hero.name}
    - 身份: ${player.identity} (主公胜利条件: 消灭反贼和内奸; 忠臣: 保护主公; 反贼: 杀主公; 内奸: 活到最后)
    - 状态: ${player.hp}/${player.maxHp} 体力
    - 手牌: ${handSummary}
    
    【局势概览】
    ${boardState}
    
    【近期战况】
    ${recentLogs}
    
    请用诸葛亮的语气（古风、智慧），根据我的身份给出简短的战术建议（不超过2句话）。
    分析谁可能是队友，谁是敌人，建议优先攻击谁或防守。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "观星台云雾缭绕，暂无良策...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "烽火连天，信号中断 (API Error)";
  }
};