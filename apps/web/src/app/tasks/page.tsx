import type { Metadata } from "next";
import { TasksBoard } from "./tasks-board";

export const metadata: Metadata = {
  title: "我的待办",
  description:
    "按岗位权限聚合需要处理的业务事项：调拨审批与接收、采购审批付款收货、盘点推进与异常设备",
};

export default function TasksPage() {
  return (
    <main className="catalog-page">
      <header className="page-heading">
        <div>
          <div className="breadcrumb">
            <span>经营总览</span>
            <b>/</b>
            <strong>我的待办</strong>
          </div>
          <h1>我的待办</h1>
          <p>
            按你的岗位权限自动聚合需要处理的业务事项，点击任意条目进入对应模块办理；
            事项由业务单据实时推导，处理完成自动消失。
          </p>
        </div>
      </header>
      <TasksBoard />
    </main>
  );
}
