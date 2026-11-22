const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export default function NotFound() {
  return (
    <main className="shell" style={{ paddingTop: 80, textAlign: "center" }}>
      <div className="glass-flat" style={{ padding: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>找不到这个页面</div>
        <a href={`${BASE_PATH}/`} className="btn btn-primary btn-block" style={{ textDecoration: "none" }}>
          回到首页
        </a>
      </div>
    </main>
  );
}