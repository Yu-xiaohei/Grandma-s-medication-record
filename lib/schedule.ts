import type { Task } from "./types";

/**
 * 默认排程：来源《老人全天进食与用药时间表_手机版-新.xlsx》Sheet 1。
 * 营养液 150×6=900 ml，纯水 610 ml，蛋/菜/奶 300 ml(g)，合计 1810 ml。
 * 首次初始化数据库时写入；之后以后台编辑为准。
 */
export const DEFAULT_TASKS: Task[] = [
  {
    id: "t0730",
    time: "07:30",
    title: "晨起空腹药",
    period: "morning",
    note: null,
    items: [
      { id: "m1", kind: "med", label: "阿司匹林 1 片", tag: "整吞" },
      { id: "m2", kind: "med", label: "丁苯酞 1 粒", tag: "整吞" },
      { id: "m3", kind: "med", label: "莫沙必利 1 片", tag: "整吞" },
      { id: "w1", kind: "water", label: "温水 50 ml" },
    ],
  },
  {
    id: "t0800",
    time: "08:00",
    title: "早餐 + 随餐药",
    period: "morning",
    note: "先测心率：低于 55~60 时，美托洛尔等心率回升再吃",
    items: [
      { id: "f1", kind: "food", label: "鸡蛋羹 100 g" },
      { id: "m1", kind: "med", label: "消化酶 1 粒", tag: "整吞" },
      { id: "m2", kind: "med", label: "呋喃妥因 1 片", tag: "随餐" },
      { id: "m3", kind: "med", label: "美托洛尔 0.5 片", tag: "看心率" },
      { id: "w1", kind: "water", label: "温水 50 ml" },
    ],
  },
  {
    id: "t0840",
    time: "08:40",
    title: "补铁 + 早利尿",
    period: "morning",
    note: "先看尿量和血压：高压低于 110 时，螺内酯等血压回升再吃",
    items: [
      { id: "m1", kind: "med", label: "螺内酯 1 片", tag: "看血压" },
      { id: "m2", kind: "med", label: "蛋白琥珀酸铁 1 瓶", tag: "药液不占水" },
      { id: "w1", kind: "water", label: "温水 30 ml" },
    ],
  },
  {
    id: "t0900",
    time: "09:00",
    title: "营养液 ①",
    period: "morning",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "w1", kind: "water", label: "温水 30 ml 漱口" },
    ],
  },
  {
    id: "t1030",
    time: "10:30",
    title: "营养液 ②",
    period: "morning",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "w1", kind: "water", label: "温水 30 ml 漱口" },
    ],
  },
  {
    id: "t1150",
    time: "11:50",
    title: "午间餐前药",
    period: "noon",
    note: null,
    items: [
      { id: "m1", kind: "med", label: "丁苯酞 1 粒", tag: "整吞" },
      { id: "m2", kind: "med", label: "莫沙必利 1 片", tag: "整吞" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t1230",
    time: "12:30",
    title: "午餐 + 随餐药",
    period: "noon",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "肉菜糊 100 g" },
      { id: "m1", kind: "med", label: "消化酶 1 粒", tag: "整吞" },
      { id: "m2", kind: "med", label: "呋喃妥因 1 片", tag: "随餐" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t1300",
    time: "13:00",
    title: "补钙 + 午利尿",
    period: "noon",
    note: "先看尿量和血压：高压低于 110 时，等 30 分钟复测达标再吃呋塞米",
    items: [
      { id: "m1", kind: "med", label: "维生素 D 1 粒" },
      { id: "m2", kind: "med", label: "液体钙 1 袋", tag: "药液不占水" },
      { id: "m3", kind: "med", label: "呋塞米 1 片", tag: "看血压" },
      { id: "w1", kind: "water", label: "温水 30 ml" },
    ],
  },
  {
    id: "t1400",
    time: "14:00",
    title: "营养液 ③",
    period: "afternoon",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "w1", kind: "water", label: "温水 30 ml 漱口" },
    ],
  },
  {
    id: "t1515",
    time: "15:15",
    title: "下午奶粉",
    period: "afternoon",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "奶粉蛋白加水 100 ml" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t1630",
    time: "16:30",
    title: "营养液 ④",
    period: "afternoon",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "w1", kind: "water", label: "温水 30 ml 漱口" },
    ],
  },
  {
    id: "t1800",
    time: "18:00",
    title: "晚间餐前药",
    period: "evening",
    note: null,
    items: [
      { id: "m1", kind: "med", label: "丁苯酞 1 粒", tag: "整吞" },
      { id: "m2", kind: "med", label: "莫沙必利 1 片", tag: "整吞" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t1830",
    time: "18:30",
    title: "营养液 ⑤ + 晚药",
    period: "evening",
    note: "先测心率：低于 55~60 时，美托洛尔等心率回升再吃",
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "m1", kind: "med", label: "消化酶 1 粒", tag: "整吞" },
      { id: "m2", kind: "med", label: "呋喃妥因 1 片", tag: "随餐" },
      { id: "m3", kind: "med", label: "美托洛尔 0.5 片", tag: "看心率" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t1930",
    time: "19:30",
    title: "调脂 + 晚利尿",
    period: "evening",
    note: "先看尿量和血压：高压低于 110 时，螺内酯等血压回升再吃；螺内酯要在 20:30 前吃完",
    items: [
      { id: "m1", kind: "med", label: "阿托伐他汀钙 1 片" },
      { id: "m2", kind: "med", label: "螺内酯 1 片", tag: "看血压" },
      { id: "w1", kind: "water", label: "温水 40 ml" },
    ],
  },
  {
    id: "t2030",
    time: "20:30",
    title: "营养液 ⑥",
    period: "evening",
    note: null,
    items: [
      { id: "f1", kind: "food", label: "营养液 150 ml" },
      { id: "w1", kind: "water", label: "温水 30 ml 漱口" },
    ],
  },
  {
    id: "t2200",
    time: "22:00",
    title: "睡前润喉水",
    period: "evening",
    note: "22:30 后不再喂水，准备入睡",
    items: [{ id: "w1", kind: "water", label: "温水 60 ml" }],
  },
];

export const SAFETY_RULES = [
  {
    icon: "drop",
    title: "利尿药先看血压",
    body: "08:40 / 13:00 / 19:30 三次利尿药，高压低于 110 先暂停，等 30 分钟复测达标再吃。",
  },
  {
    icon: "heart",
    title: "美托洛尔先看心率",
    body: "08:00 / 18:30 两次，先测心率，低于 55~60 次/分先暂停。呋喃妥因满 5 天要复查。",
  },
  {
    icon: "bed",
    title: "喂完不要马上躺平",
    body: "每次喂完，把床头抬高 30°~45°，保持 30 分钟，防止呛到。",
  },
];

export const PERIODS = [
  { key: "morning", label: "早间", range: "07:30 – 10:30" },
  { key: "noon", label: "午间", range: "11:50 – 13:00" },
  { key: "afternoon", label: "下午", range: "14:00 – 16:30" },
  { key: "evening", label: "晚间", range: "18:00 – 22:00" },
] as const;