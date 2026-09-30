const coordinateRule = `所有坐标必须基于整张待识别原图：左上角 (0,0)，右下角 (1000,1000)，X 向右、Y 向下。三个阶段共享这一个坐标系；禁止对房间、墙段或家具分别缩放、居中或平移。只根据图中明确可见的线条、填充、尺寸和符号判断，不猜测看不清的构件。`;

export function buildExteriorPrompt(plan, hasReference = false) {
  const width = Number(plan.widthMeters) > 0 ? `${Number(plan.widthMeters)} 米，必须采用` : '未提供，优先读取图纸尺寸';
  const depth = Number(plan.depthMeters) > 0 ? `${Number(plan.depthMeters)} 米，必须采用` : '未提供，优先读取图纸尺寸';
  return `阶段 1/3：仅提取外侧轮廓、连续楼板、外墙和外侧门窗。不要识别内部墙体、房间或家具。\n${coordinateRule}
${hasReference ? '本次有两张图：第一张为首层定位参考，第二张为当前楼层。只从第二张提取构件，利用两图共同的轴线、外墙角点和尺寸确定本层在首层建筑基准中的位置。上层轮廓较小时，不可把它拉伸至整栋建筑的基准范围。' : ''}

先找 modelBounds=[左,上,右,下]：它表示整栋建筑共用的定位轴网与基准尺寸范围，排除图片留白、尺寸线、文字、植物、车辆和邻楼。用户给出的宽度 ${width}，深度 ${depth}，均对应这个基准框，不对应整张纸张。

再找 exteriorOutline：沿本层封闭室内的**外墙中心线**依次输出闭合轮廓顶点，首尾不要重复。轮廓每条边都将直接建成锁定的外墙，因此不要把开放的露台边、庭院围栏、邻楼、家具边缘纳入。外墙若有折线就增加顶点；不得用简单矩形替代凹凸轮廓。

从外墙上识别 exteriorOpenings。edgeIndex 从 0 开始，表示 exteriorOutline 的第几条边（边 i 从顶点 i 到顶点 i+1，最后一边回到顶点 0）。start/end 是该边 a→b 方向的 0–1 比例，满足 0≤start<end≤1。建筑外侧边界必须连续围合：有实体墙线的区段是墙；位于建筑外边界、连接室内外但没有实体墙线的区段必须识别为窗或门，不能留成无构件的缺口。到地面的通透玻璃用 type=full、bottom=0；普通窗 type=window；入户门 type=door、bottom=0。窗与门都作为连续外墙上的 openings 输出，不要把开口从 exteriorOutline 中断开，也不要把明显的玻璃立面补成实体墙。

floorOutline 是本层实际有楼板的完整外边界，可以包含开放露台、阳台、交通厅和楼梯平台，所以它可以与 exteriorOutline 不同，允许凹形。voids 只列明确没有楼板的封闭中庭或井洞；普通楼梯、梯段、平台不是楼板洞。不确定就不要挖洞。每个多边形顶点沿边界依次排列、不自交。

只输出 JSON schema 要求的字段。自检：外墙轮廓至少 3 点且闭合意义明确；每个 exteriorOpenings.edgeIndex 对应一条真实外墙边；楼板覆盖所有室内交通空间；所有坐标在 0–1000 内。`;
}

export function buildInteriorPrompt(exterior) {
  return `阶段 2/3：在已锁定的外墙轮廓内提取内部墙体，再把可见的内部门窗安放在所属墙段。只返回内部墙，不要重复外墙。\n${coordinateRule}

阶段 1 的结果如下（只作几何约束，不是图中的额外建筑）：\n${JSON.stringify({modelBounds:exterior.modelBounds,exteriorOutline:exterior.exteriorOutline,floorOutline:exterior.floorOutline,voids:exterior.voids})}

逐段识别内部墙体中心线 a/b 和厚度 thickness（米）。在图中有明确实心、剖切填充或粗墙体填充的内墙，construction=filled，必须建模；没有墙体填充但可见分隔线、门扇与空间关系支持其存在的内墙，construction=inferred，作为可拆除内墙。每个空间边界必须由墙体及墙上的门窗连续围住；看见门扇或门洞时，必须先输出承载它的完整墙段，再把门放进 openings，不能只画门而漏掉两侧墙段。不要凭家具边线、尺寸线、窗帘或阴影生成墙。只有确实没有内部空间分隔时才返回 walls=[]。

相连的墙端点使用相同坐标；墙体与外墙的连接点落在 exteriorOutline 上。内部门窗列在对应墙的 openings 中，不要为了门窗把墙切成不连续的碎段。开口 start/end 是沿墙 a→b 的 0–1 比例；门底高 0，窗台高按图纸标注或合理默认值。只输出 schema 字段，自检无外墙重复、无悬空短墙、填充墙未遗漏。`;
}

export function buildSpacesPrompt(exterior, interior) {
  return `阶段 3/3：根据已识别的外墙和内墙，提取每个由墙体围合的内部空间。不要再修改阶段 1 的外轮廓，也不要新造墙。\n${coordinateRule}

外墙与楼板：\n${JSON.stringify({exteriorOutline:exterior.exteriorOutline,floorOutline:exterior.floorOutline,voids:exterior.voids})}
内墙：\n${JSON.stringify(interior.walls)}

rooms 每项用 polygon 沿围合它的墙体、门或窗的中心线依次列出空间边界，允许凹形。每条 polygon 边都必须能对应到一段外墙、内墙或其门窗开口，不能让空间直接敞开到未定义区域。每个闭合区域单独一个空间，包括未标名房间、走廊、楼梯间、交通厅、阳台。相邻空间共享边界角点使用完全相同的坐标，不能互相重叠，也不能在有楼板的区域无故留下空白。不要把外墙厚度、墙内门洞、家具轮廓当成单独空间。

仅识别图上明确画出的家具；没有家具时 furniture=[]，绝不为了填充画面编造。家具 center 使用同一 0–1000 坐标系，w/d 是建筑基准框宽深的 0–1000 比例，h 是米，rotation 是角度。

输出前检查：所有 room polygon 至少 3 点、不自交，并位于 floorOutline 内；逐边确认空间由墙、窗或门围合，不存在无构件的开放缺口；以墙体围合关系为准；没有可证实的空间名称时只返回几何，界面会命名为“未命名1、2、3”。只输出 JSON schema 字段。`;
}
