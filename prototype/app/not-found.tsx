import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="m-0 text-[24px] font-bold">没有找到这个页面</h1>
      <p className="m-0 text-body">首批只开通了广州。档案网址如果改过，可以从列表重新找。</p>
      <Link href="/guangzhou" className="btn-primary">回到广州首页</Link>
    </div>
  );
}
