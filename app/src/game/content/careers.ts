import type { CareerId } from './settlementTypes'
export interface CareerChapter {title:string;tasks:[string,string,string];stations:[string,string,string];level:number;field:string}
export interface CareerDef {id:CareerId;name:string;npc:string;home:number;ranks:string[];chapters:CareerChapter[]}
const c=(title:string,tasks:CareerChapter['tasks'],stations:CareerChapter['stations'],level:number,field:string):CareerChapter=>({title,tasks,stations,level,field})
export const CAREERS:Record<CareerId,CareerDef>={
 meg:{id:'meg',name:'M.E.G.',npc:'nightingale',home:101,ranks:['见习探索员','正式探索员','专项调查员','行动协调员'],chapters:[
 c('入署训练',['完成安全培训','校验出发测点','提交首份勘探报告'],['training','field_training','report'],1,'对照柱网与撤离标志'),
 c('非欧测绘',['领取测量基准','测定异常距离','复核路线闭合差'],['equipment','archive','report'],1,'记录三组实测步距'),
 c('失联队追踪',['查阅无线电记录','追踪失联信号','核验救援报告'],['radio','archive','report'],2,'调查两处中继信号'),
 c('联合勘探',['协商跨署计划','核对现场样本','完成联合评审'],['training','sample','report'],4,'完成办公走廊测绘') ]},
 bntg:{id:'bntg',name:'B.N.T.G.',npc:'vesper',home:102,ranks:['签约承运人','正式雇员','资深承运人','项目经理'],chapters:[
 c('试用交货',['登记试用货单','核对封签与数量','签收首批货物'],['career','seal','cargo'],1,'核对接货点编号'),
 c('异常盘点',['抄录基准货位','查证箱子移位','结算差异清单'],['warehouse','inventory','report'],1,'记录闪烁区货位'),
 c('跨层运输',['制定运输路线','完成跨层验货','交回收货凭证'],['dispatch','cargo','contract'],3,'采集设备仓签收记录'),
 c('争议货单',['查阅争议合同','比对证词与货单','完成保险审查'],['contract','evidence','report'],4,'核验争议货运终点') ]},
 ariane:{id:'ariane',name:'阿丽亚娜之圈',npc:'lecomte',home:103,ranks:['外部志愿者','救护协作员','研究助理','项目协作负责人'],chapters:[
 c('救护培训',['完成分诊培训','练习现场救助','提交匿名病例'],['training','care','report'],1,'辨认求助与安全撤离位置'),
 c('实体样本',['准备样本封装','采集现场记录','完成样本检测'],['sample','analysis','report'],2,'记录样本环境与污染风险'),
 c('花园病变',['阅读病例基线','调查植被病变','接受伦理审查'],['archive','analysis','ethics'],1,'记录花园病变边界'),
 c('联合医疗事件',['协调救护资源','核验隔离程序','提交医疗复盘'],['training','care','ethics'],3,'确认救护联络点') ]},
 brc:{id:'brc',name:'B.R.C.',npc:'brc_foreman',home:1,ranks:['外部协作者','持证检修员','稳定设备操作员','工程联络员'],chapters:[
 c('工地准入',['学习工地标识','检查安全隔离','通过准入验收'],['training','inspect','report'],1,'检查施工边界'),
 c('管线检修',['领取管线工单','完成隔离与维修','核验压力记录'],['dispatch','repair','report'],2,'检查管线接头'),
 c('结构稳定',['登记稳定工位','记录异常基线','提交稳定试验'],['equipment','stabilize','report'],1,'核验局部空间稳定'),
 c('联合验收',['核对协作范围','抽查修复质量','签署验收记录'],['dispatch','inspect','report'],3,'核验检修通道') ]},
 jerry:{id:'jerry',name:'Jerry 信众',npc:'jerry_guide',home:274,ranks:['初信者','正式信众','传教员','圣所执事'],chapters:[
 c('教义接触',['听取信众讲述','辨认自愿与压力','提交个人理解'],['training','testimony','report'],1,'记录外界证言'),
 c('补给站服务',['登记补给需求','核验站点物资','完成服务回访'],['dispatch','cargo','report'],3,'确认补给站状态'),
 c('外出传教',['申请公共场所许可','完成自愿接触','交回许可记录'],['career','testimony','report'],4,'核验公开交流地点'),
 c('身份抉择',['查阅不同证词','与外界求助者会谈','作出自主身份选择'],['archive','testimony','ethics'],1,'记录不受监督的外界证言') ]},
 argos:{id:'argos',name:'阿尔戈斯之眼',npc:'argos_clerk',home:116,ranks:['试用守望者','正式守望者','案件调查员','巡逻协调员'],chapters:[
 c('守望者试炼',['学习报案规则','验证现场观察','通过证据考核'],['career','evidence','hearing'],1,'查验有效目击位置'),
 c('失窃案',['登记报失清单','比对物证封签','提交失窃案卷'],['case','seal','hearing'],1,'核对失窃现场痕迹'),
 c('矛盾证词',['记录两份证词','核验证词冲突','完成听证裁决'],['testimony','evidence','hearing'],2,'核验时间与路线矛盾'),
 c('跨团体审查',['明确审查权限','核实跨团体证据','接受公开复核'],['case','evidence','hearing'],4,'核验跨团体交接地点') ]},
 tom:{id:'tom',name:'Tom 餐馆社区',npc:'tom',home:104,ranks:['熟客','帮厨','可信伙伴','社区联络人'],chapters:[
 c('开餐帮工',['核对今日订单','完成备餐流程','完成出餐检查'],['meal','prep','serve'],1,'记录顾客送餐位置'),
 c('遗失物',['登记失物特征','核对寻人留言','完成失物归还'],['lost','testimony','report'],1,'核验失物目击位置'),
 c('供应中断',['盘点厨房需求','调查断供原因','协调替代供货'],['inventory','cargo','report'],3,'查验中断的供货地点'),
 c('社区晚餐',['收集社区需求','准备公共晚餐','完成居民回访'],['meal','prep','serve'],1,'确认居民活动点') ]},
}
export const CAREER_IDS=Object.keys(CAREERS) as CareerId[]
