# division type and level

## v1

### EN

SaanSeoi uses its own taxonomy for division `level` and `type`.

We deviated from the Overture `type` schema because

1. Overture differentiates <black>types</black> into <black>subtype</black> and
   <black>class</black>, which is needlessly complex for our purposes.
2. We want to use the local terms for <black>SAR</black>, <black>district</black>, and
   <black>area</black>.

We deviated from the Overture `level` schema because

1. Administrative divisions have little practical use in Hong Kong in differentiating
   them, as fewer than 1% of the divisions have an administrative level (The SAR, and
   the 18 districts).
2. Since <black>Hong Kong / Kowloon / New Territories</black> are not recognised as
   admin levels, the Overture data has some quircks, e.g. that <black>Kowloon</black> is
   in the district of <black>Yau Tsim Mong</black>.
3. While our use of <black>level</black> is meant to support a hierarchical
   representation of all divisions in Hong Kong. Implementation of our own spatial
   hierarchy is <orange>FORTHCOMING</orange>.

We base `level` and `type` on overture's <black>subtype</black> and
<black>class</black>:

| Overture subtype            | Overture class         | SaanSeoi level | SaanSeoi type                |
| --------------------------- | ---------------------- | -------------- | ---------------------------- |
| <black>country</black>      |                        | 0              | <black>country</black>       |
| <black>dependency</black>   |                        | 0              | <black>SAR</black>           |
| <black>region</black>       |                        | 2              | <black>district</black>      |
| <black>locality</black>     | <black>city</black>    | 1              | <black>area</black>          |
| <black>locality</black>     | <black>town</black>    | 3              | <black>town</black>          |
| <black>locality</black>     | <black>village</black> | 5              | <black>village</black>       |
| <black>locality</black>     | <black>hamlet</black>  | 6              | <black>hamlet</black>        |
| <black>macrohood</black>    |                        | 4              | <black>macrohood</black>     |
| <black>neighborhood</black> |                        | 5              | <black>neighbourhood</black> |
| <black>microhood</black>    |                        | 6              | <black>microhood</black>     |

Hong Kong-specific override:

- <black>Hong Kong Island</black>, <black>Kowloon</black>, and <black>New
  Territories</black> are preserved as <black>level : 1</black> and <black>type :
  area</black> rows even where Overture labels them as <black>region</black>.

#### Fallback mapping

When none of the explicit mappings above applies, the available classification fields
are used in the following order:

1. Normalize <black>subtype</black> and <black>class</black>, then read a string value
   from <black>admin_level</black> or <black>adminLevel</black> when available.
2. Check the normalized <black>subtype</black>, then <black>class</black>, then the
   string admin-level value for a recognized level token. The first matching token
   supplies the level.
3. If no recognized token is found, use level <black>1</black> when the row has a parent
   division; otherwise use level <black>0</black>.
4. If no direct type mapping is available, derive the generic type from the resulting
   level: <black>0</black> → <black>SAR</black>, <black>1</black> → <black>area</black>,
   <black>2</black> → <black>district</black>, <black>3</black> → <black>town</black>,
   <black>4</black> → <black>macrohood</black>, <black>5</black> →
   <black>neighbourhood</black>, and <black>6</black> → <black>microhood</black>.

### ZH-HANT

SaanSeoi 使用自訂的區劃 `level` 和 `type` 分類法。

我們偏離 Overture 的 `type` schema，原因如下：

1. Overture 將 <black>types</black> 分為 <black>subtype</black> 和
   <black>class</black>，對我們的用途而言過於複雜。
2. 我們希望使用本地化的 <black>SAR</black>、<black>district</black> 和
   <black>area</black> 術語。

我們偏離 Overture 的 `level` schema，原因如下：

1. 行政區劃對香港而言在區分層級方面實際用途有限，因為只有少於 1% 的區劃具有行政層級（特別行政區及 18 個地區）。
2. 由於 <black>Hong Kong / Kowloon / New Territories</black>
   不被識別為行政層級，Overture 資料會出現一些不一致情況，例如 <black>Kowloon</black>
   被歸入 <black>Yau Tsim Mong</black> 地區。
3. 我們使用 <black>level</black> 是為了支援香港所有區劃的階層表示。自訂空間階層的實作仍
   <orange>即將推出</orange>。

我們根據 Overture 的 <black>subtype</black> 和 <black>class</black> 計算 `level` 和
`type`：

| Overture 值                 | Overture 類別          | 標準層級 | 標準類型                     |
| --------------------------- | ---------------------- | -------- | ---------------------------- |
| <black>country</black>      |                        | 0        | <black>country</black>       |
| <black>dependency</black>   |                        | 0        | <black>SAR</black>           |
| <black>region</black>       |                        | 2        | <black>district</black>      |
| <black>locality</black>     | <black>city</black>    | 1        | <black>area</black>          |
| <black>locality</black>     | <black>town</black>    | 3        | <black>town</black>          |
| <black>locality</black>     | <black>village</black> | 5        | <black>village</black>       |
| <black>locality</black>     | <black>hamlet</black>  | 6        | <black>hamlet</black>        |
| <black>macrohood</black>    |                        | 4        | <black>macrohood</black>     |
| <black>neighborhood</black> |                        | 5        | <black>neighbourhood</black> |
| <black>microhood</black>    |                        | 6        | <black>microhood</black>     |

香港專屬覆寫：

- <black>Hong Kong Island</black>、<black>Kowloon</black> 和 <black>New
  Territories</black> 會保留為 <black>level : 1</black> 和 <black>type : area</black>
  的資料列，即使 Overture 將它們標示為 <black>region</black>。

#### 回退對應

當以上明確對應均不適用時，會按以下次序使用可用的分類欄位：

1. 正規化 <black>subtype</black> 和 <black>class</black>，然後在可用時讀取
   <black>admin_level</black> 或 <black>adminLevel</black> 的字串值。
2. 依次檢查正規化後的 <black>subtype</black>、<black>class</black>
   及字串形式的行政層級值，尋找已識別的層級 token。第一個符合的 token 會決定層級。
3. 如果找不到已識別的 token，資料列有父區劃時使用層級 <black>1</black>，否則使用層級
   <black>0</black>。
4. 如果沒有直接的類型對應，便根據所得層級推導通用類型：<black>0</black> →
   <black>SAR</black>、<black>1</black> → <black>area</black>、<black>2</black> →
   <black>district</black>、<black>3</black> → <black>town</black>、<black>4</black> →
   <black>macrohood</black>、<black>5</black> → <black>neighbourhood</black>，以及
   <black>6</black> → <black>microhood</black>。

<black>locality</black> 對應需要兩個欄位。例如，<black>subtype: locality</black> 配合
<black>class: village</black> 會直接對應至層級 <black>5</black> 及類型
<black>village</black>。如果只有 <black>class:
village</black>，仍可從已識別的類別 token 恢復層級，但會使用層級 <black>5</black>
的通用類型。數值形式的 <black>admin_level</black>
不會提供回退對應；只有包含已識別 token 的字串值才會被考慮。

### ZH-HANS

SaanSeoi 使用自定义的区划 `level` 和 `type` 分类法。

我们偏离 Overture 的 `type` schema，原因如下：

1. Overture 将 <black>types</black> 分为 <black>subtype</black> 和
   <black>class</black>，对我们的用途而言过于复杂。
2. 我们希望使用本地化的 <black>SAR</black>、<black>district</black> 和
   <black>area</black> 术语。

我们偏离 Overture 的 `level` schema，原因如下：

1. 行政区划对香港而言在区分层级方面实际用途有限，因为只有少于 1% 的区划具有行政层级（特别行政区及 18 个地区）。
2. 由于 <black>Hong Kong / Kowloon / New Territories</black>
   不被识别为行政层级，Overture 数据会出现一些不一致情况，例如 <black>Kowloon</black>
   被归入 <black>Yau Tsim Mong</black> 地区。
3. 我们使用 <black>level</black>
   是为了支持香港所有区划的层级表示。自定义空间层级的实现仍 <orange>即将推出</orange>。

我们根据 Overture 的 <black>subtype</black> 和 <black>class</black> 计算 `level` 和
`type`：

| Overture 值                 | Overture 类别          | 标准层级 | 标准类型                     |
| --------------------------- | ---------------------- | -------- | ---------------------------- |
| <black>country</black>      |                        | 0        | <black>country</black>       |
| <black>dependency</black>   |                        | 0        | <black>SAR</black>           |
| <black>region</black>       |                        | 2        | <black>district</black>      |
| <black>locality</black>     | <black>city</black>    | 1        | <black>area</black>          |
| <black>locality</black>     | <black>town</black>    | 3        | <black>town</black>          |
| <black>locality</black>     | <black>village</black> | 5        | <black>village</black>       |
| <black>locality</black>     | <black>hamlet</black>  | 6        | <black>hamlet</black>        |
| <black>macrohood</black>    |                        | 4        | <black>macrohood</black>     |
| <black>neighborhood</black> |                        | 5        | <black>neighbourhood</black> |
| <black>microhood</black>    |                        | 6        | <black>microhood</black>     |

香港专属覆盖：

- <black>Hong Kong Island</black>、<black>Kowloon</black> 和 <black>New
  Territories</black> 会保留为 <black>level : 1</black> 和 <black>type : area</black>
  的数据行，即使 Overture 将它们标记为 <black>region</black>。

#### 回退映射

当以上明确映射均不适用时，会按以下顺序使用可用的分类字段：

1. 规范化 <black>subtype</black> 和 <black>class</black>，然后在可用时读取
   <black>admin_level</black> 或 <black>adminLevel</black> 的字符串值。
2. 依次检查规范化后的 <black>subtype</black>、<black>class</black>
   以及字符串形式的行政层级值，寻找已识别的层级 token。第一个匹配的 token 会决定层级。
3. 如果找不到已识别的 token，数据行有父区划时使用层级 <black>1</black>，否则使用层级
   <black>0</black>。
4. 如果没有直接的类型映射，则根据所得层级推导通用类型：<black>0</black> →
   <black>SAR</black>、<black>1</black> → <black>area</black>、<black>2</black> →
   <black>district</black>、<black>3</black> → <black>town</black>、<black>4</black> →
   <black>macrohood</black>、<black>5</black> → <black>neighbourhood</black>，以及
   <black>6</black> → <black>microhood</black>。

<black>locality</black> 映射需要两个字段。例如，<black>subtype: locality</black> 配合
<black>class: village</black> 会直接映射到层级 <black>5</black> 及类型
<black>village</black>。如果只有 <black>class:
village</black>，仍可从已识别的类别 token 恢复层级，但会使用层级 <black>5</black>
的通用类型。数值形式的 <black>admin_level</black>
不会提供回退映射；只有包含已识别 token 的字符串值才会被考虑。
