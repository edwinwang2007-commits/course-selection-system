import { useEffect, useMemo, useState } from "react";

const 后端地址 = import.meta.env.VITE_API_BASE_URL || "";

const 样式 = {
  页面: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f4f7fb 0%, #eef6f2 100%)",
    padding: "24px",
    color: "#1f2937",
  },
  容器: { maxWidth: "1320px", margin: "0 auto" },
  卡片: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    marginBottom: "20px",
    border: "1px solid #e5e7eb",
  },
  头部: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  标签栏: { display: "flex", gap: "10px", marginTop: "16px" },
  标签按钮: (激活) => ({
    border: "none",
    borderRadius: "999px",
    padding: "10px 18px",
    background: 激活 ? "#0f766e" : "#e5e7eb",
    color: 激活 ? "#fff" : "#111827",
    cursor: "pointer",
    fontSize: "14px",
  }),
  输入框: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    marginTop: "6px",
    fontSize: "14px",
    background: "#fff",
  },
  按钮: {
    border: "none",
    borderRadius: "10px",
    padding: "9px 14px",
    background: "#0f766e",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    marginTop: "10px",
  },
  次按钮: {
    border: "none",
    borderRadius: "10px",
    padding: "9px 14px",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    marginTop: "10px",
  },
  提示: {
    marginTop: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#ecfeff",
    color: "#155e75",
    fontSize: "14px",
  },
  表格容器: { overflowX: "auto", marginTop: "14px" },
  表格: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  表头: {
    textAlign: "left",
    padding: "10px",
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  单元格: {
    padding: "10px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  两列: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
};

const 年级选项 = ["大一", "大二", "大三", "大四"];

function App() {
  const [当前页面, 设置当前页面] = useState("教师端");
  const [文件, 设置文件] = useState(null);
  const [课程列表, 设置课程列表] = useState([]);
  const [上传提示, 设置上传提示] = useState("");
  const [教师提示, 设置教师提示] = useState("");
  const [人数草稿, 设置人数草稿] = useState({});

  const [学生类型, 设置学生类型] = useState("普通");
  const [年级, 设置年级] = useState("大一");
  const [学生校区, 设置学生校区] = useState("新校区");
  const [普通课程, 设置普通课程] = useState([]);
  const [班级志愿, 设置班级志愿] = useState({});
  const [学生提示, 设置学生提示] = useState("");
  const [结果, 设置结果] = useState([]);
  const [冲突提示, 设置冲突提示] = useState("");
  const [校区限制提示, 设置校区限制提示] = useState("");
  const [通勤提示, 设置通勤提示] = useState("");

  const 实际学生校区 = 年级 === "大一" ? "新校区" : 学生校区;

  const 加载课程 = async () => {
    try {
      const 响应 = await fetch(`${后端地址}/课程列表`);
      const 数据 = await 响应.json();
      if (数据.状态 === "成功") {
        const 列表 = 数据.数据.课程列表 || [];
        设置课程列表(列表);
        const 新草稿 = {};
        列表.forEach((课程) => {
          Object.entries(课程.校区人数 || {}).forEach(([校区, 人数]) => {
            新草稿[`${课程.课程ID}_${校区}_已选课人数`] = 人数;
          });
          Object.entries(课程.志愿统计数据 || {}).forEach(([校区, 数据项]) => {
            新草稿[`${课程.课程ID}_${校区}_A班一志愿人数`] = 数据项.A班一志愿人数 ?? 0;
            新草稿[`${课程.课程ID}_${校区}_A班二志愿人数`] = 数据项.A班二志愿人数 ?? 0;
            新草稿[`${课程.课程ID}_${校区}_B班一志愿人数`] = 数据项.B班一志愿人数 ?? 0;
            新草稿[`${课程.课程ID}_${校区}_B班二志愿人数`] = 数据项.B班二志愿人数 ?? 0;
          });
        });
        设置人数草稿(新草稿);
      }
    } catch (error) {}
  };

  useEffect(() => {
    加载课程();
  }, []);

  useEffect(() => {
    if (学生类型 !== "普通" && 年级 === "大一") {
      设置年级("大二");
    }
  }, [学生类型, 年级]);

  useEffect(() => {
    if (年级 === "大一") {
      设置学生校区("新校区");
    }
    设置普通课程([]);
    设置班级志愿({});
    设置结果([]);
    设置冲突提示("");
    设置校区限制提示("");
    设置通勤提示("");
  }, [年级, 学生类型, 学生校区]);

  const 上传课程数据 = async () => {
    if (!文件) {
      设置上传提示("请先选择课程 CSV 文件。");
      return;
    }
    const 表单 = new FormData();
    表单.append("file", 文件);

    try {
      const 响应 = await fetch(`${后端地址}/上传课程数据`, {
        method: "POST",
        body: 表单,
      });
      const 数据 = await 响应.json();
      if (数据.状态 !== "成功") {
        设置上传提示(数据.消息 || "上传失败");
        return;
      }
      设置上传提示("课程数据上传成功。");
      await 加载课程();
    } catch (error) {
      设置上传提示("无法连接后端，请确认后端服务已启动。");
    }
  };

  const 保存人数 = async (课程ID, 校区, 类型) => {
    try {
      const 响应 = await fetch(`${后端地址}/设置选课人数`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: 课程ID,
          校区,
          类型,
          当前人数: Number(人数草稿[`${课程ID}_${校区}_${类型}`]) || 0,
        }),
      });
      const 数据 = await 响应.json();
      if (数据.状态 !== "成功") {
        设置教师提示(数据.消息 || "保存失败");
        return;
      }
      设置教师提示(`${课程ID} ${校区} ${类型} 保存成功。`);
      await 加载课程();
    } catch (error) {
      设置教师提示("无法连接后端，请确认后端服务已启动。");
    }
  };

  const 随机生成初始人数 = async () => {
    try {
      const 响应 = await fetch(`${后端地址}/随机生成初始人数`, {
        method: "POST",
      });
      const 数据 = await 响应.json();
      if (数据.状态 !== "成功") {
        设置教师提示(数据.消息 || "生成失败");
        return;
      }
      设置教师提示("系统已随机生成初始选课人数。");
      await 加载课程();
    } catch (error) {
      设置教师提示("无法连接后端，请确认后端服务已启动。");
    }
  };

  const 可选课程列表 = useMemo(() => {
    return 课程列表.filter(
      (课程) =>
        ["普通必修", "普通选修"].includes(课程.课程类型) &&
        (课程.校区 === 实际学生校区 || 课程.校区 === "双校区") &&
        (课程.可选年级列表 || []).includes(年级)
    );
  }, [课程列表, 实际学生校区, 年级]);

  const 已选择课程ID集合 = useMemo(() => {
    const 集合 = new Set(普通课程);
    Object.entries(班级志愿).forEach(([课程ID, 数据]) => {
      if (数据?.一志愿 || 数据?.二志愿) {
        集合.add(课程ID);
      }
    });
    return 集合;
  }, [普通课程, 班级志愿]);

  const 已选择时间段集合 = useMemo(() => {
    const 集合 = new Set();
    可选课程列表.forEach((课程) => {
      if (已选择课程ID集合.has(课程.课程ID)) {
        集合.add(课程.时间段);
      }
    });
    return 集合;
  }, [可选课程列表, 已选择课程ID集合]);

  const 课程是否已选择 = (课程ID) => 已选择课程ID集合.has(课程ID);

  const 课程是否因冲突不可选 = (课程) =>
    !课程是否已选择(课程.课程ID) && 已选择时间段集合.has(课程.时间段);

  const 切换普通课程 = (课程ID) => {
    设置普通课程((旧值) =>
      旧值.includes(课程ID)
        ? 旧值.filter((id) => id !== 课程ID)
        : [...旧值, 课程ID]
    );
  };

  const 设置课程志愿 = (课程ID, 字段, 值) => {
    设置班级志愿((旧值) => ({
      ...旧值,
      [课程ID]: {
        一志愿: 旧值[课程ID]?.一志愿 || "",
        二志愿: 旧值[课程ID]?.二志愿 || "",
        [字段]: 值,
      },
    }));
  };

  const 提交选课 = async () => {
    const 必修班级志愿 = 可选课程列表
      .filter((课程) => 课程.课程类型 === "普通必修" && 班级志愿[课程.课程ID])
      .map((课程) => ({
        课程ID: 课程.课程ID,
        一志愿: 班级志愿[课程.课程ID].一志愿 || "",
        二志愿: 班级志愿[课程.课程ID].二志愿 || "",
      }))
      .filter((课程) => 课程.一志愿 || 课程.二志愿);

    if (普通课程.length === 0 && 必修班级志愿.length === 0) {
      设置学生提示("请至少选择一门课程。");
      return;
    }

    try {
      const 响应 = await fetch(`${后端地址}/学生选课`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          学生类型,
          年级,
          学生校区: 实际学生校区,
          普通课程,
          必修班级志愿,
        }),
      });
      const 数据 = await 响应.json();
      if (数据.状态 !== "成功") {
        设置学生提示(数据.消息 || "选课失败");
        return;
      }
      设置学生提示("选课完成。");
      设置结果(数据.结果 || []);
      设置冲突提示(数据.冲突提示 || "");
      设置校区限制提示(数据.校区限制提示 || "");
      设置通勤提示(数据.通勤提示 || "");
      await 加载课程();
    } catch (error) {
      设置学生提示("无法连接后端，请确认后端服务已启动。");
    }
  };

  return (
    <div style={样式.页面}>
      <div style={样式.容器}>
        <div style={样式.卡片}>
          <div style={样式.头部}>
            <div>
              <h1 style={{ margin: 0, fontSize: "32px" }}>概率选课系统</h1>
              <div style={{ marginTop: "8px", color: "#64748b", fontSize: "14px" }}>
                课程只有普通必修和普通选修；学生身份只影响录取优先级。
              </div>
            </div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>
              后端地址：{后端地址}
            </div>
          </div>
          <div style={样式.标签栏}>
            <button style={样式.标签按钮(当前页面 === "教师端")} onClick={() => 设置当前页面("教师端")}>
              教师端
            </button>
            <button style={样式.标签按钮(当前页面 === "学生端")} onClick={() => 设置当前页面("学生端")}>
              学生端
            </button>
          </div>
        </div>

        {当前页面 === "教师端" && (
          <>
            <div style={样式.卡片}>
              <h2 style={{ marginTop: 0 }}>上传课程数据</h2>
              <input type="file" accept=".csv" style={样式.输入框} onChange={(e) => 设置文件(e.target.files?.[0] || null)} />
              <button style={样式.按钮} onClick={上传课程数据}>上传课程数据</button>
              {上传提示 && <div style={样式.提示}>{上传提示}</div>}
            </div>

            <div style={样式.卡片}>
              <div style={样式.头部}>
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: "8px" }}>教师模拟人数设置</h2>
                  <div style={{ color: "#64748b", fontSize: "14px" }}>
                    所有课程只显示已选课人数。普通选修直接设置已选课人数；普通必修按 A班/B班 的一志愿、二志愿分别设置。
                  </div>
                </div>
                <button style={样式.次按钮} onClick={随机生成初始人数}>
                  随机生成初始选课人数
                </button>
              </div>
              {教师提示 && <div style={样式.提示}>{教师提示}</div>}
              <div style={样式.表格容器}>
                <table style={样式.表格}>
                  <thead>
                    <tr>
                      <th style={样式.表头}>课程名称</th>
                      <th style={样式.表头}>课程类型</th>
                      <th style={样式.表头}>可选年级</th>
                      <th style={样式.表头}>校区</th>
                      <th style={样式.表头}>时间段</th>
                      <th style={样式.表头}>容量</th>
                      <th style={样式.表头}>已选课人数</th>
                      <th style={样式.表头}>班级容量</th>
                      <th style={样式.表头}>普通必修志愿已选课人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {课程列表.map((课程) => (
                      <tr key={课程.课程ID}>
                        <td style={样式.单元格}>{课程.课程名称}</td>
                        <td style={样式.单元格}>{课程.课程类型}</td>
                        <td style={样式.单元格}>{课程.可选年级}</td>
                        <td style={样式.单元格}>{课程.校区}</td>
                        <td style={样式.单元格}>{课程.时间段}</td>
                        <td style={样式.单元格}>{课程.容量}</td>
                        <td style={样式.单元格}>
                          {课程.课程类型 === "普通必修"
                            ? Object.entries(课程.校区人数 || {}).map(([校区, 人数]) => (
                                <div key={`${课程.课程ID}_${校区}_汇总`} style={{ marginBottom: "10px" }}>
                                  <div>{校区} 已选课人数汇总</div>
                                  <div style={{ marginTop: "6px", color: "#64748b" }}>{人数}</div>
                                </div>
                              ))
                            : Object.keys(课程.校区人数 || {}).map((校区) => (
                                <div key={`${课程.课程ID}_${校区}_已选课人数`} style={{ marginBottom: "10px" }}>
                                  <div>{校区} 已选课人数</div>
                                  <input
                                    type="number"
                                    min="0"
                                    style={样式.输入框}
                                    value={人数草稿[`${课程.课程ID}_${校区}_已选课人数`] ?? 0}
                                    onChange={(e) =>
                                      设置人数草稿((旧值) => ({
                                        ...旧值,
                                        [`${课程.课程ID}_${校区}_已选课人数`]: e.target.value,
                                      }))
                                    }
                                  />
                                  <button style={样式.按钮} onClick={() => 保存人数(课程.课程ID, 校区, "已选课人数")}>
                                    保存
                                  </button>
                                </div>
                              ))}
                        </td>
                        <td style={样式.单元格}>{课程.班级容量}</td>
                        <td style={样式.单元格}>
                          {课程.课程类型 === "普通必修"
                            ? Object.keys(课程.志愿统计数据 || {}).map((校区) => (
                                <div key={`${课程.课程ID}_${校区}_志愿`} style={{ marginBottom: "12px" }}>
                                  <div style={{ fontWeight: 600 }}>{校区}</div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(2, minmax(160px, 1fr))",
                                      gap: "12px",
                                      marginTop: "8px",
                                    }}
                                  >
                                    {[
                                      ["A班一志愿人数", "A班一志愿人数"],
                                      ["A班二志愿人数", "A班二志愿人数"],
                                      ["B班一志愿人数", "B班一志愿人数"],
                                      ["B班二志愿人数", "B班二志愿人数"],
                                    ].map(([标签, 类型]) => (
                                      <div
                                        key={`${课程.课程ID}_${校区}_${类型}`}
                                        style={{
                                          border: "1px solid #e5e7eb",
                                          borderRadius: "10px",
                                          padding: "10px",
                                          background: "#fafafa",
                                        }}
                                      >
                                        <div style={{ fontSize: "13px", marginBottom: "6px" }}>{标签}</div>
                                        <input
                                          type="number"
                                          min="0"
                                          style={样式.输入框}
                                          value={人数草稿[`${课程.课程ID}_${校区}_${类型}`] ?? 0}
                                          onChange={(e) =>
                                            设置人数草稿((旧值) => ({
                                              ...旧值,
                                              [`${课程.课程ID}_${校区}_${类型}`]: e.target.value,
                                            }))
                                          }
                                        />
                                        <button style={样式.次按钮} onClick={() => 保存人数(课程.课程ID, 校区, 类型)}>
                                          保存
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            : "非普通必修课"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {当前页面 === "学生端" && (
          <>
            <div style={样式.卡片}>
              <h2 style={{ marginTop: 0 }}>学生信息</h2>
              <div style={样式.两列}>
                <div>
                  <div>学生类型</div>
                  <select style={样式.输入框} value={学生类型} onChange={(e) => 设置学生类型(e.target.value)}>
                    <option value="普通">普通</option>
                    <option value="转专业">转专业</option>
                    <option value="辅修">辅修</option>
                  </select>
                </div>
                <div>
                  <div>年级</div>
                  <select style={样式.输入框} value={年级} onChange={(e) => 设置年级(e.target.value)}>
                    {年级选项
                      .filter((项) => 学生类型 === "普通" || 项 !== "大一")
                      .map((项) => (
                        <option key={项} value={项}>
                          {项}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <div>学生校区</div>
                  <select style={样式.输入框} value={实际学生校区} disabled={年级 === "大一"} onChange={(e) => 设置学生校区(e.target.value)}>
                    <option value="老校区">老校区</option>
                    <option value="新校区">新校区</option>
                  </select>
                  {年级 === "大一" && <div style={{ marginTop: "6px", color: "#64748b", fontSize: "12px" }}>大一学生默认在新校区</div>}
                </div>
              </div>
            </div>

            <div style={样式.卡片}>
              <h2 style={{ marginTop: 0 }}>选课界面</h2>
              <div style={{ color: "#64748b", fontSize: "14px" }}>
                只要某门课已经选择，其他同时间课程会自动变为不可选；取消后会恢复。普通必修使用一志愿、二志愿下拉框选择 A班、B班 或 空。
              </div>
              <div style={样式.表格容器}>
                <table style={样式.表格}>
                  <thead>
                    <tr>
                      <th style={样式.表头}>选择</th>
                      <th style={样式.表头}>课程名称</th>
                      <th style={样式.表头}>课程类型</th>
                      <th style={样式.表头}>可选年级</th>
                      <th style={样式.表头}>校区</th>
                      <th style={样式.表头}>本校区容量</th>
                      <th style={样式.表头}>本校区已选课人数</th>
                      <th style={样式.表头}>班级容量</th>
                      <th style={样式.表头}>班级志愿</th>
                      <th style={样式.表头}>时间段</th>
                    </tr>
                  </thead>
                  <tbody>
                    {可选课程列表.length === 0 ? (
                      <tr>
                        <td style={样式.单元格} colSpan="10">
                          当前条件下没有可选课程。
                        </td>
                      </tr>
                    ) : (
                      可选课程列表.map((课程) => (
                        <tr key={课程.课程ID}>
                          <td style={样式.单元格}>
                            {课程.课程类型 === "普通必修" ? (
                              <div>{课程是否因冲突不可选(课程) ? "时间冲突不可选" : "右侧选择志愿"}</div>
                            ) : (
                              <input
                                type="checkbox"
                                checked={普通课程.includes(课程.课程ID)}
                                disabled={课程是否因冲突不可选(课程)}
                                onChange={() => 切换普通课程(课程.课程ID)}
                              />
                            )}
                          </td>
                          <td style={样式.单元格}>{课程.课程名称}</td>
                          <td style={样式.单元格}>{课程.课程类型}</td>
                          <td style={样式.单元格}>{课程.可选年级}</td>
                          <td style={样式.单元格}>{课程.校区}</td>
                          <td style={样式.单元格}>{课程.校区容量?.[实际学生校区] ?? 0}</td>
                          <td style={样式.单元格}>{课程.校区人数?.[实际学生校区] ?? 0}</td>
                          <td style={样式.单元格}>
                            {课程.课程类型 === "普通必修"
                              ? `A班${课程.班级容量数据?.[实际学生校区]?.A班 ?? 0} / B班${课程.班级容量数据?.[实际学生校区]?.B班 ?? 0}`
                              : "-"}
                          </td>
                          <td style={样式.单元格}>
                            {课程.课程类型 === "普通必修" ? (
                              <>
                                <div>一志愿</div>
                                <select
                                  style={样式.输入框}
                                  value={班级志愿[课程.课程ID]?.一志愿 || ""}
                                  disabled={课程是否因冲突不可选(课程)}
                                  onChange={(e) => 设置课程志愿(课程.课程ID, "一志愿", e.target.value)}
                                >
                                  <option value="">空</option>
                                  <option value="A班">A班</option>
                                  <option value="B班">B班</option>
                                </select>
                                <div style={{ marginTop: "8px" }}>二志愿</div>
                                <select
                                  style={样式.输入框}
                                  value={班级志愿[课程.课程ID]?.二志愿 || ""}
                                  disabled={课程是否因冲突不可选(课程)}
                                  onChange={(e) => 设置课程志愿(课程.课程ID, "二志愿", e.target.value)}
                                >
                                  <option value="">空</option>
                                  <option value="A班">A班</option>
                                  <option value="B班">B班</option>
                                </select>
                                {课程是否因冲突不可选(课程) && (
                                  <div style={{ marginTop: "6px", color: "#b45309", fontSize: "12px" }}>
                                    该课程与已选择课程时间冲突
                                  </div>
                                )}
                              </>
                            ) : (
                              课程是否因冲突不可选(课程) ? "时间冲突不可选" : "-"
                            )}
                          </td>
                          <td style={样式.单元格}>{课程.时间段}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button style={样式.按钮} onClick={提交选课}>提交选课</button>

              {学生提示 && <div style={样式.提示}>{学生提示}</div>}
              {冲突提示 && <div style={样式.提示}>{冲突提示}</div>}
              {校区限制提示 && <div style={样式.提示}>{校区限制提示}</div>}
              {通勤提示 && <div style={样式.提示}>{通勤提示}</div>}

              {结果.length > 0 && (
                <div style={样式.表格容器}>
                  <table style={样式.表格}>
                    <thead>
                      <tr>
                        <th style={样式.表头}>课程名称</th>
                        <th style={样式.表头}>是否选上</th>
                        <th style={样式.表头}>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {结果.map((项, index) => (
                        <tr key={`${项.课程名称}_${index}`}>
                          <td style={样式.单元格}>{项.课程名称}</td>
                          <td style={样式.单元格}>{项.是否选上 ? "是" : "否"}</td>
                          <td style={样式.单元格}>{项.说明 || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
