// 「龙胆」技能测试脚本
// 这个脚本可以在浏览器控制台中运行，用于测试赵云「龙胆」技能的各项功能

console.log('=== 开始测试赵云「龙胆」技能 ===');

// 测试场景1: 出牌阶段主动使用「龙胆」技能
function testActiveLongdan() {
  console.log('\n【测试1】出牌阶段主动使用「龙胆」技能');
  
  // 模拟玩家为赵云且手牌中有杀
  const playerIsZhaoyun = gameState.currentPlayer?.hero?.name === '赵云';
  const hasSha = gameState.currentPlayer?.hand?.some(card => card.name === '杀');
  const hasShan = gameState.currentPlayer?.hand?.some(card => card.name === '闪');
  
  if (playerIsZhaoyun) {
    console.log('✅ 玩家当前是赵云');
    if (hasSha) console.log('✅ 手牌中有【杀】，可以当【闪】使用');
    if (hasShan) console.log('✅ 手牌中有【闪】，可以当【杀】使用');
    console.log('请在游戏中尝试：点击【杀】或【闪】，检查是否有技能提示和目标选择');
  } else {
    console.log('❌ 玩家不是赵云，请选择赵云进行游戏来测试');
  }
}

// 测试场景2: 遭受攻击时使用「龙胆」技能
function testReactiveLongdan() {
  console.log('\n【测试2】遭受攻击时使用「龙胆」技能');
  console.log('请等待其他玩家使用【杀】攻击赵云时测试');
  console.log('- 检查是否出现「选择使用技能」的提示');
  console.log('- 测试选择使用【闪】或【杀】当【闪】的功能');
  console.log('- 验证取消选择后是否正常承受伤害');
}

// 测试场景3: 技能使用的UI和日志展示
function testUILog() {
  console.log('\n【测试3】技能UI和日志展示');
  console.log('使用技能时请检查：');
  console.log('- 手牌上是否显示「可使用技能」的边框效果');
  console.log('- 卡牌右上角是否有技能图标');
  console.log('- 卡牌底部是否有技能提示文字');
  console.log('- 日志中是否以特殊颜色显示技能使用记录("skill"类型)');
}

// 执行所有测试
testActiveLongdan();
testReactiveLongdan();
testUILog();

console.log('\n=== 测试说明 ===');
console.log('1. 请选择「赵云」作为英雄进行游戏');
console.log('2. 在出牌阶段测试主动使用「龙胆」技能');
console.log('3. 让其他玩家使用【杀】攻击赵云，测试被动技能触发');
console.log('4. 检查UI效果和日志记录是否符合预期');
console.log('\n测试完成后，请在控制台中查看结果或报告问题');