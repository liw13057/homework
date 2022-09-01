# Homework
## 作业
### 要求: 
- 1. 要求: 
  - a) 把资源2的数据展示到地图上面，显示城市的点的大小能够跟城市人口数量大小相关 
  - b) 用列表展示当前地图范围内的城市数据 
    - i. 数据从资源2里面查询 
    - ii. 列表的高度可以展示10条数据，首次只查询10条数据，可以滚动加载更多的数据，每次加载10条
    - iii. 为避免性能问题，列表里面只能渲染30个行 
    - iv. 鼠标Hover到list，map里面对应的城市高亮 
- 2. 技术要求: 
  - a) 不可以用除资源1外的任何前端框架 
- 3. 代码里面的注释要求英文 
- 4. 面试的时候，需要讲清楚: 
  - a) ArcGIS JavaScript API里面这些class的意思及关系:FeatureLayer, Renderer, Graphic, Geometry 
  - b) 任务的时间分配，具体实现进度 
### 资源: 
- 1. https://developers.arcgis.com/javascript/latest/
- 2. http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer

## 概念理解
### 名词理解
Geometry：地理位置、形状信息
- 类型：比如表达点、线、多边形
- 编码：坐标的表达方式，采用spatialReference定义， 比如经纬度方式wkid: 4326
Graphic：图形，视图上显示的图形
Map：容器，管理basemap和各种layers
- basemap基础图层，指定topographic（地形）、imagery（卫星照片）等作为底图
- layer：管理单个图层数据集，用于表达某种类型信息，比如城市人口、道路、行政区划
  - 每条记录叫一个feature，包含地理信息（geometry）、属性（attributes）
  - structured，结构化数据，每条记录的地理信息类型和属性字段相同，比如FeatureLayer，schema
  - Unstructured，非结构化数据，每条记录的地理信息类型或属性字段不同，比如GraphicsLayer，no schema
View：视图，通过不同的layerView显示图层，处理用户交互等各种事件
- 创建View时区分2D/3D：MapView 2D，SceneView 3D
- WebMap、WebScene：预配置，便于共享、复用。
Renderer：FeatureLayer内的一个feature展示到LayerView上的方式。

![Map & MapView](https://raw.githubusercontent.com/liwufu163/homework/main/images/map-mapview.png)

![Map View Layer](https://raw.githubusercontent.com/liwufu163/homework/main/images/map-view-layer.png)

### 类模型
Accessor：所有类的基类
- 提供getter、setter，类似lodash支持a.b.c.d形式
- watch用于监听属性变化。
reactiveUtils用于简化监听编程模型：属性值变化、表达式计算结果成立、只回调一次等

### Service
- 数据源、提供数据服务，
  - 官方、用户自己配置、第三方提供
- Service通过REST API访问方式：
https://<host>/<context>/rest/services/<folder>/<serviceName>/<serviceType>/<serviceLayer>/<operation>
查询参数可通过GET或POST方式传递
组织层次：（结果自表达）
service一般包含多个layer，每个层级都有相应支持的操作

layers 查询所有layer和table定义，通过id查询单个layer或table定义 
id/query进行layer内的数据查询，需要附带参数

layer查询，参数类似SQL查询：
  Where查询条件
  Out Fields指定查询结果字段 
  Result Offset、Result Record Count可以控制分页 
  Order By Fields指定结果排序pop2000 DESC，DESC降序
  f 结果格式

城市人口查询参数录入界面：http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/0/query

服务端&本地数据源
- Server-side data source：从service服务器进行查询，经过网络传输获取。比如FeatureLayer.queryFeatures进行查询
- Client-side data source：已经缓存到客户端本地，不需要经过网络传输。比如通过FeatureLayerView.queryFeatures进行查询

## 实现
### 开发前准备 
初步学习开发文档，了解4 a中概念——了解编程模型，数据服务和layer、renderer如何配合使用 
分析资源2数据结构，了解：接口请求方式（如何分页）；返回数据内城市、坐标、人口等数据的格式。 
#### 最初设想技术点 
如何展示地图（方法、初始位置、范围控制） 
如何获得窗口内地图当前范围（视口范围变化后如何得到回调做更新，如何监听用户的对应操作：平移、缩放、窗口resize等） 
如何根据地图范围从资源2进行查询
地图上如何进行自定义绘图（通过经纬度坐标进行图形绘制，设想根据查询结果自行绘制） 
列表如何实现——框架自带的Widgets/FeatureTable 
加载更多实现（监听滚动，判断滚动到底部触发） 
鼠标hover处理（enter及leave） 

### 开发过程
1、最小demo，实现了地图展示和图形绘制，理解Map、MapView、Layer等关系
2、了解service（定义数据源），组织结构，定义，layer数据字段结构、如何查询，能够配置数据查询 
确定实现方法：
3、地图验证FeatureLayer+SimpleRenderer+Labels
- 为FeatureLayer关联服务端数据源，通过Renderer->Symbol设置来实现点大小同人口数量相关。（若将layer关联到map则会取回全部数据集，按文档应该是根据可视范围按需加载，可能是示例的数据量不够大，不到4000条。先查询数据总数，后分4个分页请求取回）
- 第二种方法是使用独立的FeatureLayer来处理数据请求。再将查询结果通过applyEdits来更新Map内的FeatureLayer的source。达到同Widget/FeatureTable公用数据的目的。
- 第三种方法是通过FeatureLayer进行数据查询，将查询结果通过GraphicsLayer来进行展示。
- 二和三碰到了不同坐标系表达间如何转换问题，而且感觉地图上的点同列表项同步增加在行为逻辑上有点怪，放弃。（https://developers.arcgis.com/javascript/latest/api-reference/esri-geometry-support-GeographicTransformation.html）
4、解决监听窗口内地图当前范围变化
- 预想是监听导致地图展示范围变化的不同事件：drag、zoom、resize
- 参考示例发现可以通过监听view.stationary值来实现
- 了解编程模型，如何监听对象属性值变化：Accessor watch 或 reactiveUtils watch when 
5、列表展示（当时还是认为最多展示前30条）
- 发现SDK内的Widgets/FeatureTable无法满足需求，无法监听hover及处理scroll
- 决定采用直接操作DOM的方式实现列表
6、数据查询及列表初始化
7、列表hover及地图内对应symbol的highlight
8、scroll到底部后触发加载更多，总数据30条限制。
9、数据请求和更新逻辑实现（防抖、请求后数据有效性检查）

第一次提交作业后
10、列表调整为虚拟列表实现
11、bug及交互优化
- 多个highlight问题：异步导致
- 上拉加载更多位置及提示文案：增加了上拉阈值

### 业务逻辑
#### 防抖
LoadMore可能被触发多次，若当前已有请求在进行中，则后继的上拉操作不产生查询请求
通过queryPending标记是否有进行中请求

#### 失效数据丢弃
地图显示范围更新后，需要重新加载列表数据。若用户操作导致地图显示范围更新较快，则存在前一个列表数据查询请求还没有完成时后一个请求就需要进行的情况。由于这些请求是无法cancel的，这样就需要在收到请求应答时，判断收到的数据是否是当前视图范围对应的数据。
方法是给每次请求都分配一个唯一的标识，即当前的queryMagicWord值；发起新请求时queryMagicWord都自动增长1，这样当收到结果应答时通过比对请求时的标识同当前的queryMagicWord是否一致，即能判断出请求结果是否有效。这样来达到丢弃失效数据的目的。

### 优化
#### 虚拟列表

![Virtual List](https://raw.githubusercontent.com/liwufu163/homework/main/images/virtual-list.png)

目的：解决DOM节点过多导致性能下降问题
实现要点
1、子div相当父div进行定位，通过css：listDiv的position: relative;，子div为position: absolute;（相对第一个非static定位的父节点）
2、listSpace的高度根据列表元素来动态计算，这样使内容区域的总高度同渲染全部DOM节点时相等，父窗口的滚动位置为正常显示。
3、listContent内容动态显示可视区域及前后一定数量的节点，根据父窗口scroll位置设置它的top位置，使其正好中间部分位于父窗口可视区域内，并且也根据父窗口的scroll位置计算当前listContent的显示范围来更新列表项的内容。前后各预留一定数量节点是为了防止滚动过快时出现空白。

#### DOM批量操作
目的：减少DOM操作次数，减少因为DOM操作造成的渲染树重排和重绘
分2种情况
1、获取更多节点后，节点总数尚未超过listContent许可限制
通过DocumentFragment进行批量添加即可
2、上下滚动过程中，导致的父窗口视口移动，需要更新listContent（加载更多达到限制后等同于向下滚动一屏）
- 根据滚动的量判断需要向上或向下替换的元素个数
- 从listContent删除被替换的节点，更新该节点后，缓存到一个DocumentFragment内
- 保留仍被使用的节点（若滚动过快可能没有需要保留的节点）
- 将DocumentFragment插入到正确位置
注：可通过操作前将listContent设为display: none，操作完成后再恢复display: block。通过脱离文档流后进行更新的方式来减少DOM更新次数。采用这种方法后，未经测量，直观感受上和上述方式没有太大差别。

### 进一步优化
#### 减少Event Listener
list-item的mouseenter、mouseleave可以减少。类似React合成事件，减少listener数量，不需要频繁调用add、remove。
让listContent监听mousemove事件，根据当前鼠标位置计算对应的list-item元素，通过改变其class来模拟列表内元素的hover视觉状态，同时也根据当前list-item元素的变化来更新地图上的highlight。

#### 列表上拉卡顿优化
卡顿的感觉是由于网络请求时延造成
对比Layer和LayerView查询差异
类似可以预加载数据，上拉时取本地缓存数据，可以加快上拉相应

视觉改善：在等待网络请求时，做一些视觉上的优化分散用户注意力，降低卡顿感觉

#### 模块化：提取虚拟list组件
封装虚拟列表逻辑，js+css
配置：list-item高度、列表单屏item个数、可视item数量、总item数量
list-item的渲染、更新操作作为外界处理的回调，将相应的element作为参数传递给外界，获得更新后结果
数据加载相关：数据请求indicator设置、loadmore触发
模拟（合成）事件回调：模拟的hover、mouseenter、mouseleave