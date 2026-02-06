# 🛠️ 企業 LLM 自動化實作指南

> 詳細說明如何用 VSMONSTER 實際建置開源（營收增長）應用

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   🛠️ IMPLEMENTATION GUIDE                                                ║
║                                                                          ║
║   從概念 ──► 設定 ──► 開發 ──► 部署 ──► 監控                            ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 📑 目錄

- [前置準備](#-前置準備)
- [案例一：智能追加銷售系統](#-案例一智能追加銷售系統)
- [案例二：動態定價引擎](#-案例二動態定價引擎)
- [案例三：個人化推薦系統](#-案例三個人化推薦系統)
- [案例四：會員喚醒自動化](#-案例四會員喚醒自動化)
- [MCP 服務整合](#-mcp-服務整合)
- [監控與優化](#-監控與優化)

---

## 🔧 前置準備

### Step 1：環境設定

```bash
# 1. 確認 Node.js 版本
node -v  # 需要 >= 20.0.0

# 2. 安裝 VSMONSTER
git clone https://github.com/your-username/vsmonster.git
cd vsmonster
pnpm install

# 3. 設定 Moltbot（社群連接）
moltbot onboard
```

### Step 2：設定檔準備

建立 `configs/config.json`：

```json
{
  "port": 3000,
  "channels": {
    "telegram": {
      "botToken": "YOUR_TELEGRAM_BOT_TOKEN"
    }
  },
  "tunnel": {
    "enabled": true,
    "authtoken": "YOUR_NGROK_TOKEN"
  },
  "mcp": {
    "enabled": true,
    "services": ["filesystem", "browser", "database"]
  },
  "enterprise": {
    "mode": "revenue",
    "features": {
      "upselling": true,
      "dynamicPricing": true,
      "personalization": true
    }
  }
}
```

### Step 3：資料庫連接（選用）

如果需要存取企業數據，設定資料庫連接：

```json
// configs/database.json
{
  "connections": {
    "sales": {
      "type": "postgresql",
      "host": "your-db-host.com",
      "port": 5432,
      "database": "sales_db",
      "user": "readonly_user",
      "password": "${DB_PASSWORD}"
    },
    "crm": {
      "type": "mysql",
      "host": "crm-db.internal",
      "database": "customer_data"
    }
  }
}
```

---

## 🍔 案例一：智能追加銷售系統

> 目標：根據顧客點餐內容，即時推薦加購品項，提升客單價 15-25%

### 系統架構

```
┌─────────────────────────────────────────────────────────────────────┐
│                      智能追加銷售系統架構                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────┐    ┌─────────────┐    ┌─────────────┐               │
│   │ POS/    │───►│  VSMONSTER  │───►│   LLM       │               │
│   │ Kiosk   │    │  Gateway    │    │   分析引擎   │               │
│   └─────────┘    └──────┬──────┘    └──────┬──────┘               │
│                         │                  │                       │
│                         ▼                  ▼                       │
│                  ┌─────────────┐    ┌─────────────┐               │
│                  │ 交易歷史    │    │ 推薦結果    │               │
│                  │ 資料庫      │    │ 返回 POS    │               │
│                  └─────────────┘    └─────────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Step 1：建立推薦規則設定

建立 `configs/upselling-rules.json`：

```json
{
  "rules": {
    "burger_combo": {
      "trigger": ["大麥克", "雙層牛肉堡", "麥香雞"],
      "recommend": [
        {
          "item": "薯條加大",
          "condition": "size == 'medium'",
          "discount": 10,
          "priority": 1,
          "message": "薯條加大只要 +$10，要幫您升級嗎？"
        },
        {
          "item": "冰炫風",
          "condition": "time >= 14:00 && time <= 17:00",
          "discount": 15,
          "priority": 2,
          "message": "下午茶時段，冰炫風特價 $45！"
        }
      ]
    },
    "breakfast": {
      "trigger": ["滿福堡", "豬肉滿福堡"],
      "recommend": [
        {
          "item": "薯餅",
          "condition": "!cart.includes('薯餅')",
          "priority": 1,
          "message": "加購香脆薯餅只要 $25"
        }
      ]
    }
  },
  "contextFactors": {
    "weather": {
      "hot": { "boost": ["冷飲", "冰品"], "suppress": ["熱飲"] },
      "cold": { "boost": ["熱飲", "湯品"], "suppress": ["冰品"] },
      "rainy": { "boost": ["外帶套餐", "熱飲"] }
    },
    "timeOfDay": {
      "morning": { "boost": ["咖啡", "早餐套餐"] },
      "afternoon": { "boost": ["甜點", "下午茶"] },
      "evening": { "boost": ["套餐", "家庭分享餐"] }
    }
  }
}
```

### Step 2：VSMONSTER 指令實作

在社群平台（LINE/Telegram）發送指令：

```
/task 建立智能追加銷售 API

需求：
1. 接收 POS 傳來的購物車內容 (JSON)
2. 分析顧客歷史購買記錄（如有會員 ID）
3. 考慮當前時段、天氣、庫存
4. 回傳最多 3 個追加推薦
5. 每個推薦包含：品項、價格、話術

技術規格：
- API endpoint: POST /api/upsell/recommend
- 回應時間 < 200ms
- 支援 A/B 測試標籤

請建立完整的 Node.js API
```

### Step 3：API 實作範例

VSMONSTER + Copilot 會生成類似以下程式碼：

```typescript
// src/api/upsell/recommend.ts
import { Router } from 'express';
import { UpsellingEngine } from '../../services/upselling-engine';
import { WeatherService } from '../../services/weather';
import { InventoryService } from '../../services/inventory';

const router = Router();
const engine = new UpsellingEngine();

interface CartItem {
  id: string;
  name: string;
  size?: 'small' | 'medium' | 'large';
  quantity: number;
  price: number;
}

interface UpsellRequest {
  cartItems: CartItem[];
  memberId?: string;
  storeId: string;
  timestamp: string;
}

interface Recommendation {
  itemId: string;
  itemName: string;
  originalPrice: number;
  discountedPrice: number;
  message: string;
  priority: number;
  abTestGroup: string;
}

router.post('/api/upsell/recommend', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { cartItems, memberId, storeId, timestamp }: UpsellRequest = req.body;
    
    // 1. 取得上下文因素
    const [weather, inventory, memberHistory] = await Promise.all([
      WeatherService.getCurrentWeather(storeId),
      InventoryService.getAvailableItems(storeId),
      memberId ? getMemberHistory(memberId) : null
    ]);
    
    // 2. 執行推薦引擎
    const recommendations = await engine.getRecommendations({
      cart: cartItems,
      context: {
        weather,
        timeOfDay: getTimeOfDay(timestamp),
        dayOfWeek: new Date(timestamp).getDay(),
        inventory
      },
      memberHistory,
      maxRecommendations: 3
    });
    
    // 3. A/B 測試分組
    const abGroup = getABTestGroup(memberId || storeId);
    const finalRecs = applyABTestVariant(recommendations, abGroup);
    
    // 4. 記錄推薦（供後續分析）
    await logRecommendation({
      storeId,
      memberId,
      cartItems,
      recommendations: finalRecs,
      responseTime: Date.now() - startTime
    });
    
    res.json({
      success: true,
      recommendations: finalRecs,
      responseTime: Date.now() - startTime
    });
    
  } catch (error) {
    console.error('Upsell recommendation error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// 推薦引擎核心邏輯
class UpsellingEngine {
  private rules: any;
  
  constructor() {
    this.rules = require('../../../configs/upselling-rules.json');
  }
  
  async getRecommendations(params: {
    cart: CartItem[];
    context: any;
    memberHistory: any;
    maxRecommendations: number;
  }): Promise<Recommendation[]> {
    const { cart, context, memberHistory, maxRecommendations } = params;
    
    let candidates: Recommendation[] = [];
    
    // 基於規則的推薦
    for (const item of cart) {
      const itemRules = this.findMatchingRules(item.name);
      for (const rule of itemRules) {
        if (this.evaluateCondition(rule.condition, { cart, context })) {
          candidates.push({
            itemId: rule.itemId,
            itemName: rule.item,
            originalPrice: rule.originalPrice,
            discountedPrice: rule.originalPrice - rule.discount,
            message: rule.message,
            priority: rule.priority,
            abTestGroup: 'rule_based'
          });
        }
      }
    }
    
    // 基於會員歷史的個人化推薦
    if (memberHistory) {
      const personalizedRecs = await this.getPersonalizedRecommendations(
        cart, 
        memberHistory,
        context
      );
      candidates.push(...personalizedRecs);
    }
    
    // 應用上下文加權
    candidates = this.applyContextBoost(candidates, context);
    
    // 排序並返回 top N
    return candidates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxRecommendations);
  }
  
  private applyContextBoost(
    candidates: Recommendation[], 
    context: any
  ): Recommendation[] {
    const { weather, timeOfDay } = context;
    const weatherConfig = this.rules.contextFactors.weather[weather];
    const timeConfig = this.rules.contextFactors.timeOfDay[timeOfDay];
    
    return candidates.map(rec => {
      let boostedPriority = rec.priority;
      
      // 天氣加權
      if (weatherConfig?.boost?.some(cat => rec.itemName.includes(cat))) {
        boostedPriority += 2;
      }
      if (weatherConfig?.suppress?.some(cat => rec.itemName.includes(cat))) {
        boostedPriority -= 3;
      }
      
      // 時段加權
      if (timeConfig?.boost?.some(cat => rec.itemName.includes(cat))) {
        boostedPriority += 1;
      }
      
      return { ...rec, priority: boostedPriority };
    });
  }
}

export default router;
```

### Step 4：部署與測試

```bash
# 透過 VSMONSTER 執行測試
/task 測試追加銷售 API

測試案例：
1. 單點大麥克 → 應推薦薯條加大
2. 下午茶時段點餐 → 應推薦冰炫風
3. 下雨天 → 應推薦熱飲
4. 會員有咖啡購買記錄 → 應推薦咖啡

請執行測試並回報結果
```

### Step 5：監控儀表板

```
/task 建立追加銷售監控儀表板

指標：
1. 追加銷售成功率（按門市、時段）
2. 平均客單價提升幅度
3. 各推薦品項的接受率
4. API 回應時間 P95
5. A/B 測試各組表現

使用 Grafana + InfluxDB
```

---

## 💰 案例二：動態定價引擎

> 目標：根據需求、庫存、競爭者價格即時調整定價，最大化收益

### 系統架構

```
┌─────────────────────────────────────────────────────────────────────┐
│                      動態定價引擎架構                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │                     資料輸入層                             │    │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │    │
│   │  │ 銷售數據 │  │ 庫存數據 │  │ 競品價格 │  │ 外部因素 │      │    │
│   │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘      │    │
│   │       └────────────┴────────────┴────────────┘            │    │
│   └───────────────────────────┬───────────────────────────────┘    │
│                               ▼                                     │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │                    VSMONSTER + LLM                        │    │
│   │                                                           │    │
│   │   ┌─────────────┐    ┌─────────────┐    ┌────────────┐   │    │
│   │   │ 需求預測    │───►│ 價格最佳化  │───►│ 定價決策   │   │    │
│   │   │ 模型        │    │ 引擎        │    │ 輸出       │   │    │
│   │   └─────────────┘    └─────────────┘    └────────────┘   │    │
│   │                                                           │    │
│   └───────────────────────────┬───────────────────────────────┘    │
│                               ▼                                     │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │                     執行層                                 │    │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │    │
│   │  │ 電商平台 │  │ POS 系統 │  │ 看板/標籤│                   │    │
│   │  └─────────┘  └─────────┘  └─────────┘                   │    │
│   └───────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Step 1：定價策略設定

建立 `configs/pricing-strategy.json`：

```json
{
  "strategy": "revenue_maximization",
  "constraints": {
    "minMargin": 0.15,
    "maxPriceChange": 0.25,
    "priceFloor": "cost * 1.1",
    "priceCeiling": "msrp * 1.2",
    "changeFrequency": "daily",
    "competitorPriceGap": {
      "min": -0.05,
      "max": 0.15
    }
  },
  "elasticityConfig": {
    "highElasticity": {
      "threshold": -2.0,
      "strategy": "conservative",
      "maxIncrease": 0.05
    },
    "mediumElasticity": {
      "threshold": -1.0,
      "strategy": "balanced",
      "maxIncrease": 0.15
    },
    "lowElasticity": {
      "threshold": -0.5,
      "strategy": "aggressive",
      "maxIncrease": 0.25
    }
  },
  "seasonalAdjustments": {
    "holiday": { "modifier": 1.15, "dates": ["12-24", "12-25", "02-14"] },
    "endOfSeason": { "modifier": 0.70, "weeksBeforeEnd": 4 },
    "newArrival": { "modifier": 1.10, "daysAfterLaunch": 14 }
  },
  "inventoryRules": {
    "overstock": {
      "threshold": 2.0,
      "action": "discount",
      "modifier": 0.85
    },
    "lowStock": {
      "threshold": 0.3,
      "action": "premium",
      "modifier": 1.10
    },
    "clearance": {
      "daysToExpiry": 30,
      "action": "aggressive_discount",
      "modifier": 0.60
    }
  }
}
```

### Step 2：需求預測模型設定

```
/task 建立需求預測模型

需求：
1. 輸入：過去 2 年銷售數據、價格歷史、促銷記錄、外部因素
2. 輸出：未來 7/14/30 天各 SKU 預測銷量
3. 考慮因素：
   - 季節性
   - 星期效應
   - 節日影響
   - 天氣
   - 競品促銷

技術規格：
- 使用 Prophet 或 LightGBM
- 每日自動重新訓練
- 提供預測信心區間

請建立完整的 Python 預測服務
```

### Step 3：價格最佳化引擎

```typescript
// src/services/pricing-engine.ts

interface PricingInput {
  sku: string;
  currentPrice: number;
  cost: number;
  msrp: number;
  inventory: number;
  avgDailySales: number;
  demandForecast: number[];
  competitorPrices: number[];
  elasticity: number;
}

interface PricingOutput {
  recommendedPrice: number;
  priceChange: number;
  priceChangePercent: number;
  expectedRevenue: number;
  expectedMargin: number;
  confidence: number;
  reasoning: string;
}

class PricingEngine {
  private strategy: any;
  
  constructor() {
    this.strategy = require('../../configs/pricing-strategy.json');
  }
  
  async optimizePrice(input: PricingInput): Promise<PricingOutput> {
    const {
      sku, currentPrice, cost, msrp,
      inventory, avgDailySales, demandForecast,
      competitorPrices, elasticity
    } = input;
    
    // 1. 計算價格邊界
    const priceFloor = Math.max(
      cost * 1.1,  // 最低 10% 毛利
      currentPrice * (1 - this.strategy.constraints.maxPriceChange)
    );
    
    const priceCeiling = Math.min(
      msrp * 1.2,
      currentPrice * (1 + this.strategy.constraints.maxPriceChange)
    );
    
    // 2. 競品價格參考
    const avgCompetitorPrice = competitorPrices.length > 0
      ? competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length
      : currentPrice;
    
    const competitorAdjustedCeiling = avgCompetitorPrice * 
      (1 + this.strategy.constraints.competitorPriceGap.max);
    
    // 3. 庫存壓力調整
    const daysOfInventory = inventory / avgDailySales;
    let inventoryModifier = 1.0;
    
    if (daysOfInventory > this.strategy.inventoryRules.overstock.threshold * 30) {
      inventoryModifier = this.strategy.inventoryRules.overstock.modifier;
    } else if (daysOfInventory < this.strategy.inventoryRules.lowStock.threshold * 30) {
      inventoryModifier = this.strategy.inventoryRules.lowStock.modifier;
    }
    
    // 4. 彈性定價
    const elasticityConfig = this.getElasticityStrategy(elasticity);
    
    // 5. 最佳化計算
    const optimalPrice = this.calculateOptimalPrice({
      currentPrice,
      priceFloor,
      priceCeiling: Math.min(priceCeiling, competitorAdjustedCeiling),
      inventoryModifier,
      elasticity,
      elasticityConfig,
      demandForecast
    });
    
    // 6. 計算預期效果
    const priceChange = optimalPrice - currentPrice;
    const expectedDemandChange = elasticity * (priceChange / currentPrice);
    const expectedSales = avgDailySales * (1 + expectedDemandChange);
    const expectedRevenue = optimalPrice * expectedSales;
    const expectedMargin = (optimalPrice - cost) / optimalPrice;
    
    return {
      recommendedPrice: Math.round(optimalPrice),
      priceChange,
      priceChangePercent: priceChange / currentPrice,
      expectedRevenue,
      expectedMargin,
      confidence: this.calculateConfidence(elasticity, competitorPrices.length),
      reasoning: this.generateReasoning({
        inventoryModifier,
        elasticity,
        competitorGap: optimalPrice / avgCompetitorPrice - 1
      })
    };
  }
  
  private calculateOptimalPrice(params: any): number {
    // 使用梯度下降或網格搜索找最佳價格
    // 目標函數：最大化 Revenue = Price × Demand(Price)
    // Demand(Price) = BaseDemand × (1 + Elasticity × PriceChange%)
    
    const { currentPrice, priceFloor, priceCeiling, elasticity } = params;
    
    let bestPrice = currentPrice;
    let bestRevenue = 0;
    
    // 網格搜索
    for (let price = priceFloor; price <= priceCeiling; price += 1) {
      const priceChange = (price - currentPrice) / currentPrice;
      const demandChange = elasticity * priceChange;
      const expectedDemand = 1 + demandChange;  // 相對於基準
      const revenue = price * expectedDemand;
      
      if (revenue > bestRevenue) {
        bestRevenue = revenue;
        bestPrice = price;
      }
    }
    
    return bestPrice;
  }
}

export { PricingEngine };
```

### Step 4：排程自動執行

```
/task 設定動態定價排程

需求：
1. 每日凌晨 2:00 執行價格最佳化
2. 重大事件（競品大促、節日）即時觸發
3. 價格變動需要主管審核（變動 > 10%）
4. 自動更新電商平台價格
5. 記錄所有價格變動歷史

使用 Node.js cron + 審核流程
```

### Step 5：定價監控儀表板

```
/task 建立定價監控儀表板

指標：
1. 各品類平均售價 vs 競品
2. 動態定價覆蓋率
3. 價格變動頻率與幅度
4. 收益提升（vs 固定定價基線）
5. 庫存週轉天數

報表：
- 每日定價調整清單
- 每週收益分析
- 異常價格警報
```

---

## 🎯 案例三：個人化推薦系統

> 目標：基於用戶行為與偏好，提供個人化商品推薦，提升轉換率與客單價

### Step 1：用戶行為追蹤設定

建立 `configs/tracking-config.json`：

```json
{
  "events": {
    "pageView": {
      "collect": ["productId", "categoryId", "timestamp", "referrer"],
      "ttl": "90d"
    },
    "productView": {
      "collect": ["productId", "viewDuration", "scrollDepth", "priceAtView"],
      "ttl": "90d"
    },
    "addToCart": {
      "collect": ["productId", "quantity", "cartValue"],
      "ttl": "365d"
    },
    "purchase": {
      "collect": ["orderId", "products", "totalValue", "paymentMethod"],
      "ttl": "forever"
    },
    "search": {
      "collect": ["query", "resultsCount", "clickedResults"],
      "ttl": "90d"
    }
  },
  "userProfile": {
    "attributes": [
      "preferredCategories",
      "priceRange",
      "brandAffinity",
      "purchaseFrequency",
      "averageOrderValue",
      "lifetimeValue"
    ],
    "updateFrequency": "realtime"
  },
  "segments": {
    "highValue": { "ltv": ">10000", "frequency": ">5" },
    "atRisk": { "daysSinceLastPurchase": ">60", "previousPurchases": ">2" },
    "newUser": { "daysSinceRegistration": "<30", "purchases": 0 },
    "priceConsious": { "avgDiscountUsed": ">0.2" }
  }
}
```

### Step 2：推薦模型設定

```
/task 建立個人化推薦系統

需求：
1. 混合推薦策略：
   - 協同過濾（用戶相似性）
   - 內容推薦（商品相似性）
   - 知識圖譜（商品關聯）
   - 即時行為（session-based）

2. 推薦場景：
   - 首頁個人化
   - 商品頁「你可能也喜歡」
   - 購物車「加購推薦」
   - 結帳頁「湊單推薦」
   - 搜尋結果重排序

3. 技術規格：
   - 回應時間 < 100ms
   - 支援 A/B 測試
   - 可解釋性（為什麼推薦）

請建立完整的推薦服務
```

### Step 3：推薦 API 實作

```typescript
// src/api/recommendations.ts

interface RecommendationRequest {
  userId?: string;
  sessionId: string;
  context: {
    scene: 'homepage' | 'product_page' | 'cart' | 'checkout' | 'search';
    currentProductId?: string;
    cartItems?: string[];
    searchQuery?: string;
  };
  limit?: number;
}

interface RecommendedProduct {
  productId: string;
  score: number;
  reason: string;
  reasonType: 'similar_users' | 'similar_items' | 'frequently_bought' | 'trending' | 'personalized';
}

router.post('/api/recommend', async (req, res) => {
  const { userId, sessionId, context, limit = 10 }: RecommendationRequest = req.body;
  
  // 1. 獲取用戶特徵
  const userProfile = userId 
    ? await getUserProfile(userId)
    : await getSessionProfile(sessionId);
  
  // 2. 根據場景選擇策略
  const strategies = getStrategiesForScene(context.scene);
  
  // 3. 執行各推薦策略
  const candidatesPromises = strategies.map(strategy => 
    strategy.getRecommendations({
      userProfile,
      context,
      limit: limit * 2  // 取多一些候選
    })
  );
  
  const allCandidates = await Promise.all(candidatesPromises);
  
  // 4. 融合與重排序
  const mergedCandidates = mergeAndRerank(
    allCandidates.flat(),
    userProfile,
    context
  );
  
  // 5. 過濾已購買/已瀏覽/無庫存
  const filtered = await filterCandidates(mergedCandidates, {
    userId,
    excludePurchased: true,
    excludeOutOfStock: true,
    excludeCurrentCart: context.cartItems
  });
  
  // 6. 取 top N 並附加解釋
  const finalRecs = filtered.slice(0, limit).map(rec => ({
    ...rec,
    reason: generateReasonText(rec.reasonType, rec)
  }));
  
  // 7. 記錄推薦（供後續評估）
  await logRecommendation({
    userId,
    sessionId,
    scene: context.scene,
    recommendations: finalRecs
  });
  
  res.json({ recommendations: finalRecs });
});

// 推薦理由生成
function generateReasonText(type: string, rec: any): string {
  const templates = {
    'similar_users': '和你品味相似的人也買了這個',
    'similar_items': '與你瀏覽的商品風格相似',
    'frequently_bought': '經常與購物車商品一起購買',
    'trending': '本週熱銷商品',
    'personalized': '根據你的偏好推薦'
  };
  return templates[type] || '為你推薦';
}
```

### Step 4：A/B 測試設定

```json
// configs/ab-test-config.json
{
  "experiments": {
    "homepage_rec_algorithm": {
      "name": "首頁推薦演算法測試",
      "status": "running",
      "startDate": "2024-01-15",
      "variants": {
        "control": {
          "weight": 0.33,
          "algorithm": "collaborative_filtering"
        },
        "variant_a": {
          "weight": 0.33,
          "algorithm": "hybrid_v2"
        },
        "variant_b": {
          "weight": 0.34,
          "algorithm": "transformer_based"
        }
      },
      "metrics": {
        "primary": "click_through_rate",
        "secondary": ["conversion_rate", "revenue_per_user", "avg_order_value"]
      },
      "minimumSampleSize": 10000,
      "statisticalSignificance": 0.95
    }
  }
}
```

---

## 📧 案例四：會員喚醒自動化

> 目標：自動識別沉睡會員，生成個人化喚醒內容，召回流失客戶

### Step 1：會員生命週期定義

建立 `configs/member-lifecycle.json`：

```json
{
  "stages": {
    "active": {
      "definition": "daysSinceLastPurchase <= 30",
      "actions": ["regular_newsletter", "new_arrival_alert"]
    },
    "cooling": {
      "definition": "daysSinceLastPurchase > 30 && daysSinceLastPurchase <= 60",
      "actions": ["engagement_email", "personalized_offer"]
    },
    "dormant": {
      "definition": "daysSinceLastPurchase > 60 && daysSinceLastPurchase <= 90",
      "actions": ["win_back_campaign", "exclusive_discount"]
    },
    "churned": {
      "definition": "daysSinceLastPurchase > 90",
      "actions": ["reactivation_campaign", "survey"]
    }
  },
  "reactivationTriggers": {
    "birthdayApproaching": {
      "daysBefore": 7,
      "offer": "birthday_discount_20"
    },
    "anniversaryApproaching": {
      "daysBefore": 7,
      "offer": "anniversary_points_2x"
    },
    "favoriteItemOnSale": {
      "discountThreshold": 0.2,
      "trigger": "immediate"
    },
    "cartAbandonment": {
      "hoursAfter": 24,
      "offer": "free_shipping"
    }
  }
}
```

### Step 2：自動化工作流程設定

```
/task 建立會員喚醒自動化系統

需求：
1. 每日自動掃描會員狀態
2. 識別進入 cooling/dormant/churned 的會員
3. 根據會員偏好生成個人化內容：
   - Email 主旨與內文
   - 推薦商品清單
   - 專屬優惠券
4. 透過適當管道發送（Email / LINE / SMS）
5. 追蹤開信、點擊、轉換

技術規格：
- 使用 LLM 生成個人化文案
- 支援多語言（繁中、英文）
- A/B 測試不同文案風格

請建立完整的自動化流程
```

### Step 3：LLM 文案生成 Prompt

```typescript
// src/services/content-generator.ts

const generateWinBackEmail = async (member: MemberProfile): Promise<EmailContent> => {
  const prompt = `
你是一個專業的 CRM 行銷文案撰寫者。請為以下會員生成一封喚醒信。

會員資料：
- 姓名：${member.name}
- 性別：${member.gender}
- 上次購買：${member.lastPurchaseDate}（${member.daysSinceLastPurchase} 天前）
- 購買偏好：${member.preferredCategories.join('、')}
- 過去常買品牌：${member.favoriteBrands.join('、')}
- 平均客單價：$${member.averageOrderValue}
- 累積消費：$${member.lifetimeValue}

本次優惠：
- 優惠碼：${member.offerCode}
- 折扣：${member.offerDescription}
- 有效期：${member.offerExpiry}

推薦商品：
${member.recommendedProducts.map(p => `- ${p.name} (原價 $${p.price})`).join('\n')}

要求：
1. 主旨要吸引人且有緊迫感
2. 內文要親切、個人化、不要太長
3. 強調專屬優惠
4. 包含清楚的 CTA
5. 繁體中文

請輸出 JSON 格式：
{
  "subject": "信件主旨",
  "preheader": "預覽文字（50字內）",
  "body": "信件內文（HTML 格式）",
  "cta": "CTA 按鈕文字"
}
`;

  const response = await callLLM(prompt);
  return JSON.parse(response);
};
```

### Step 4：排程與執行

```typescript
// src/jobs/member-reactivation.ts
import cron from 'node-cron';

// 每日凌晨 3:00 執行會員掃描
cron.schedule('0 3 * * *', async () => {
  console.log('Starting member reactivation scan...');
  
  // 1. 取得狀態變化的會員
  const membersToProcess = await getMembersWithStateChange();
  
  for (const member of membersToProcess) {
    try {
      // 2. 判斷要執行的動作
      const actions = getActionsForState(member.currentState);
      
      for (const action of actions) {
        // 3. 生成個人化內容
        const content = await generateContent(member, action);
        
        // 4. 選擇發送管道
        const channel = selectBestChannel(member);
        
        // 5. 排入發送佇列（錯開發送時間）
        await queueMessage({
          memberId: member.id,
          channel,
          content,
          sendAt: calculateOptimalSendTime(member)
        });
        
        // 6. 記錄
        await logReactivationAttempt(member.id, action, channel);
      }
    } catch (error) {
      console.error(`Error processing member ${member.id}:`, error);
    }
  }
});

// 計算最佳發送時間
function calculateOptimalSendTime(member: MemberProfile): Date {
  // 基於會員過去的開信時間分析
  const preferredHour = member.preferredEmailHour || 10;
  const today = new Date();
  today.setHours(preferredHour, 0, 0, 0);
  
  // 如果已經過了今天的最佳時間，排到明天
  if (today < new Date()) {
    today.setDate(today.getDate() + 1);
  }
  
  return today;
}
```

---

## 🔌 MCP 服務整合

VSMONSTER 支援透過 MCP 擴展能力，以下是常用的開源應用整合：

### 資料庫查詢 MCP

```json
// configs/mcp/database.json
{
  "name": "@mcp/database",
  "config": {
    "allowedOperations": ["SELECT"],
    "maxRows": 10000,
    "timeout": 30000,
    "connections": {
      "sales": "postgresql://user:pass@host/sales",
      "crm": "mysql://user:pass@host/crm"
    }
  }
}
```

使用範例：
```
/mcp database query "SELECT product_id, SUM(quantity) as total_sales 
FROM orders 
WHERE order_date >= '2024-01-01' 
GROUP BY product_id 
ORDER BY total_sales DESC 
LIMIT 20"
```

### Email 發送 MCP

```json
// configs/mcp/email.json
{
  "name": "@mcp/email",
  "config": {
    "provider": "sendgrid",
    "apiKey": "${SENDGRID_API_KEY}",
    "fromEmail": "noreply@yourcompany.com",
    "templates": {
      "win_back": "d-abc123...",
      "cart_abandonment": "d-def456..."
    }
  }
}
```

使用範例：
```
/mcp email send-template win_back to="user@example.com" 
  variables='{"name":"王小明","offer_code":"WINBACK20"}'
```

### 價格監控 MCP

```json
// configs/mcp/price-monitor.json
{
  "name": "@mcp/price-monitor",
  "config": {
    "competitors": [
      { "name": "CompetitorA", "baseUrl": "https://api.competitor-a.com" },
      { "name": "CompetitorB", "baseUrl": "https://api.competitor-b.com" }
    ],
    "updateFrequency": "6h",
    "alertThreshold": 0.1
  }
}
```

---

## 📊 監控與優化

### 關鍵指標儀表板

```
/task 建立開源應用監控儀表板

包含以下指標：

1. 追加銷售
   - 推薦展示次數
   - 接受率
   - 平均增加金額
   - ROI

2. 動態定價
   - 價格調整次數
   - 平均調幅
   - 收益變化
   - 競品價差

3. 個人化推薦
   - 推薦 CTR
   - 推薦轉換率
   - 推薦貢獻營收占比

4. 會員喚醒
   - 發送數量
   - 開信率
   - 點擊率
   - 喚醒成功率（回購）

使用 Grafana + Prometheus
```

### 效果追蹤 SQL

```sql
-- 追加銷售效果追蹤
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_orders,
  SUM(CASE WHEN upsell_accepted THEN 1 ELSE 0 END) as upsell_orders,
  ROUND(100.0 * SUM(CASE WHEN upsell_accepted THEN 1 ELSE 0 END) / COUNT(*), 2) as upsell_rate,
  AVG(CASE WHEN upsell_accepted THEN upsell_value ELSE 0 END) as avg_upsell_value,
  AVG(order_total) as avg_order_value
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- 動態定價 vs 固定定價 A/B 測試
SELECT
  pricing_group,
  COUNT(*) as orders,
  SUM(revenue) as total_revenue,
  AVG(revenue) as avg_revenue,
  SUM(profit) as total_profit,
  AVG(profit_margin) as avg_margin
FROM orders o
JOIN ab_test_assignments a ON o.session_id = a.session_id
WHERE a.experiment = 'dynamic_pricing_v2'
  AND o.created_at >= '2024-01-01'
GROUP BY pricing_group;

-- 會員喚醒成效
SELECT
  campaign_name,
  COUNT(*) as sent,
  SUM(CASE WHEN opened THEN 1 ELSE 0 END) as opened,
  ROUND(100.0 * SUM(CASE WHEN opened THEN 1 ELSE 0 END) / COUNT(*), 2) as open_rate,
  SUM(CASE WHEN clicked THEN 1 ELSE 0 END) as clicked,
  ROUND(100.0 * SUM(CASE WHEN clicked THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN opened THEN 1 ELSE 0 END), 0), 2) as ctr,
  SUM(CASE WHEN converted THEN 1 ELSE 0 END) as converted,
  SUM(conversion_value) as total_revenue
FROM reactivation_campaigns
WHERE sent_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY campaign_name
ORDER BY total_revenue DESC;
```

---

## 🚀 快速開始檢查清單

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ✅ 開源應用實作檢查清單                                                 ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  □ 環境設定                                                              ║
║    □ VSMONSTER 安裝完成                                                  ║
║    □ 社群平台連接成功（LINE/Telegram/Discord）                           ║
║    □ VS Code Extension 安裝                                              ║
║    □ MCP 服務設定                                                        ║
║                                                                          ║
║  □ 資料準備                                                              ║
║    □ 資料庫連接設定                                                      ║
║    □ 歷史銷售數據準備                                                    ║
║    □ 會員數據準備                                                        ║
║    □ 商品目錄準備                                                        ║
║                                                                          ║
║  □ 策略設定                                                              ║
║    □ 追加銷售規則定義                                                    ║
║    □ 定價策略與限制設定                                                  ║
║    □ 會員生命週期定義                                                    ║
║    □ A/B 測試計劃                                                        ║
║                                                                          ║
║  □ 開發與測試                                                            ║
║    □ API 開發完成                                                        ║
║    □ 單元測試通過                                                        ║
║    □ 整合測試通過                                                        ║
║    □ 效能測試通過（回應時間）                                            ║
║                                                                          ║
║  □ 部署與監控                                                            ║
║    □ 生產環境部署                                                        ║
║    □ 監控儀表板設定                                                      ║
║    □ 警報規則設定                                                        ║
║    □ 備份與災難復原                                                      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

[← 返回主文件](../README.md) | [開源案例](./enterprise-cases-revenue.md) | [節流案例](./enterprise-cases-brands.md)
