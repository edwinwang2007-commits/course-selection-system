import os
import json
from io import StringIO
import random
from typing import List
from pathlib import Path

import pandas as pd
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


app = FastAPI(
    title="概率选课系统",
    description="支持双校区、年级过滤与普通必修双班志愿顺序的简易选课平台",
    version="9.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


必要字段 = [
    "course_id",
    "course_name",
    "campus",
    "course_type",
    "time_slot",
    "capacity",
    "current_enrollment",
    "available_grades",
]

课程表 = pd.DataFrame()
状态文件路径 = Path(__file__).resolve().parent / "data" / "state.json"
前端构建目录 = Path(__file__).resolve().parent.parent / "frontend" / "dist"

课程类型权重 = {
    "普通必修": 1.0,
    "普通选修": 0.65,
}

学生类型权重 = {
    "普通": 1.0,
    "转专业": 0.9,
    "辅修": 0.75,
}

自动分类规则 = {
    "普通必修": "A（镜像开课）",
    "普通选修": "C（资源分配）",
}

选修年级加权 = {
    "大一": 0.85,
    "大二": 1.0,
    "大三": 1.1,
    "大四": 1.2,
}


class 设置人数请求(BaseModel):
    course_id: str
    校区: str
    类型: str
    当前人数: int


class 必修班级志愿项(BaseModel):
    课程ID: str
    一志愿: str = ""
    二志愿: str = ""


class 学生选课请求(BaseModel):
    学生类型: str
    年级: str
    学生校区: str
    普通课程: List[str] = Field(default_factory=list)
    必修班级志愿: List[必修班级志愿项] = Field(default_factory=list)


def 初始化校区容量(row):
    capacity = int(row["capacity"])
    campus = str(row["campus"])
    if campus == "双校区":
        old_capacity = capacity // 2
        new_capacity = capacity - old_capacity
        return {"老校区": old_capacity, "新校区": new_capacity}
    return {campus: capacity}


def 初始化校区人数(row):
    enrollment = int(row["current_enrollment"])
    campus = str(row["campus"])
    if campus == "双校区":
        old_count = enrollment // 2
        new_count = enrollment - old_count
        return {"老校区": old_count, "新校区": new_count}
    return {campus: enrollment}


def 初始化班级容量(row):
    if str(row["course_type"]) != "普通必修":
        return {}
    result = {}
    for campus, capacity in 初始化校区容量(row).items():
        a_capacity = capacity // 2
        b_capacity = capacity - a_capacity
        result[campus] = {"A班": a_capacity, "B班": b_capacity}
    return result


def 初始化志愿统计(row):
    if str(row["course_type"]) != "普通必修":
        return {}
    template = {"A班一志愿人数": 0, "A班二志愿人数": 0, "B班一志愿人数": 0, "B班二志愿人数": 0}
    campus = str(row["campus"])
    if campus == "双校区":
        return {"老校区": dict(template), "新校区": dict(template)}
    return {campus: dict(template)}


def 解析可选年级(text: str):
    return [item.strip() for item in str(text).split("|") if item.strip()]


def 概率录取(capacity: int, selected_count: int, weight: float) -> bool:
    if capacity <= 0:
        return False
    base_probability = 1.0 if selected_count <= 0 else capacity / max(1, selected_count)
    probability = min(1.0, base_probability * weight)
    return random.random() < probability


def 获取允许类型(student_type: str):
    return {"普通必修", "普通选修"}


def 年级合法(student_type: str, grade: str) -> bool:
    if student_type in {"转专业", "辅修"} and grade == "大一":
        return False
    return grade in {"大一", "大二", "大三", "大四"}


def 实际校区(grade: str, campus: str) -> str:
    if grade == "大一":
        return "新校区"
    return campus


def 课程适用于校区(row, campus: str):
    course_campus = str(row["campus"])
    return course_campus == campus or course_campus == "双校区"


def 课程适用于年级(row, grade: str):
    return grade in row["可选年级列表"]


def 课程年级权重(course_type: str, grade: str):
    if course_type == "普通选修":
        return 选修年级加权.get(grade, 1.0)
    return 1.0


def 同步普通必修校区已选课人数(index: int):
    choice_counts = 课程表.at[index, "志愿统计"]
    if not choice_counts:
        return
    campus_counts = {}
    for campus, data in choice_counts.items():
        campus_counts[campus] = (
            int(data.get("A班一志愿人数", 0))
            + int(data.get("A班二志愿人数", 0))
            + int(data.get("B班一志愿人数", 0))
            + int(data.get("B班二志愿人数", 0))
        )
    课程表.at[index, "校区人数"] = campus_counts


def 更新显示列():
    if 课程表.empty:
        return
    课程表["容量显示"] = 课程表["校区容量"].apply(
        lambda value: " / ".join(f"{campus}:{count}" for campus, count in value.items())
    )
    课程表["已选课人数显示"] = 课程表["校区人数"].apply(
        lambda value: " / ".join(f"{campus}:{count}" for campus, count in value.items())
    )
    课程表["班级容量显示"] = 课程表["班级容量"].apply(
        lambda value: " / ".join(
            f"{campus}:A班{group.get('A班', 0)},B班{group.get('B班', 0)}"
            for campus, group in value.items()
        )
        if value
        else "-"
    )
    课程表["志愿已选课人数显示"] = 课程表["志愿统计"].apply(
        lambda value: " / ".join(
            f"{campus}:A一{data.get('A班一志愿人数', 0)},A二{data.get('A班二志愿人数', 0)},B一{data.get('B班一志愿人数', 0)},B二{data.get('B班二志愿人数', 0)}"
            for campus, data in value.items()
        )
        if value
        else "-"
    )


def 确保状态目录():
    状态文件路径.parent.mkdir(parents=True, exist_ok=True)


def 序列化课程表():
    if 课程表.empty:
        return []
    可保存字段 = [
        "course_id",
        "course_name",
        "campus",
        "course_type",
        "time_slot",
        "capacity",
        "current_enrollment",
        "available_grades",
        "校区容量",
        "校区人数",
        "班级容量",
        "志愿统计",
    ]
    records = []
    for _, row in 课程表.iterrows():
        item = {}
        for field in 可保存字段:
            value = row[field]
            if hasattr(value, "item"):
                try:
                    value = value.item()
                except Exception:
                    pass
            item[field] = value
        records.append(item)
    return records


def 保存状态():
    确保状态目录()
    payload = {"课程列表": 序列化课程表()}
    状态文件路径.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def 从记录恢复课程表(records):
    global 课程表
    if not records:
        课程表 = pd.DataFrame()
        return
    df = pd.DataFrame(records)
    df["course_id"] = df["course_id"].astype(str)
    df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce").fillna(0).astype(int)
    df["current_enrollment"] = pd.to_numeric(df["current_enrollment"], errors="coerce").fillna(0).astype(int)
    df["可选年级列表"] = df["available_grades"].apply(解析可选年级)
    if "校区容量" not in df.columns:
        df["校区容量"] = df.apply(初始化校区容量, axis=1)
    if "校区人数" not in df.columns:
        df["校区人数"] = df.apply(初始化校区人数, axis=1)
    if "班级容量" not in df.columns:
        df["班级容量"] = df.apply(初始化班级容量, axis=1)
    if "志愿统计" not in df.columns:
        df["志愿统计"] = df.apply(初始化志愿统计, axis=1)
    课程表 = df
    更新显示列()


def 加载状态():
    global 课程表
    if not 状态文件路径.exists():
        return
    try:
        payload = json.loads(状态文件路径.read_text(encoding="utf-8"))
        从记录恢复课程表(payload.get("课程列表", []))
    except Exception:
        课程表 = pd.DataFrame()


def 随机生成初始人数():
    global 课程表
    if 课程表.empty:
        return False

    for index in 课程表.index:
        course_type = str(课程表.at[index, "course_type"])
        campus_capacity = dict(课程表.at[index, "校区容量"])

        if course_type == "普通选修":
            campus_counts = {}
            for campus, capacity in campus_capacity.items():
                lower = max(0, int(capacity * 0.35))
                upper = max(lower, int(capacity * 0.9))
                campus_counts[campus] = random.randint(lower, upper)
            课程表.at[index, "校区人数"] = campus_counts
        else:
            class_capacity = dict(课程表.at[index, "班级容量"])
            choice_counts = {}
            for campus, group in class_capacity.items():
                a_capacity = int(group.get("A班", 0))
                b_capacity = int(group.get("B班", 0))
                a_first = random.randint(max(0, int(a_capacity * 0.35)), max(1, int(a_capacity * 0.95)))
                a_second = random.randint(0, max(1, int(a_capacity * 0.55)))
                b_first = random.randint(max(0, int(b_capacity * 0.35)), max(1, int(b_capacity * 0.95)))
                b_second = random.randint(0, max(1, int(b_capacity * 0.55)))
                choice_counts[campus] = {
                    "A班一志愿人数": a_first,
                    "A班二志愿人数": a_second,
                    "B班一志愿人数": b_first,
                    "B班二志愿人数": b_second,
                }
            课程表.at[index, "志愿统计"] = choice_counts
            同步普通必修校区已选课人数(index)

    更新显示列()
    保存状态()
    return True


def 返回课程列表():
    if 课程表.empty:
        return []
    result = []
    for _, row in 课程表.iterrows():
        result.append(
            {
                "课程ID": str(row["course_id"]),
                "课程名称": str(row["course_name"]),
                "校区": str(row["campus"]),
                "课程类型": str(row["course_type"]),
                "时间段": str(row["time_slot"]),
                "自动分类": 自动分类规则.get(str(row["course_type"]), "C（资源分配）"),
                "可选年级": row["available_grades"],
                "容量": row["容量显示"],
                "已选课人数": row["已选课人数显示"],
                "班级容量": row["班级容量显示"],
                "志愿已选课人数": row["志愿已选课人数显示"],
                "校区容量": row["校区容量"],
                "校区人数": row["校区人数"],
                "班级容量数据": row["班级容量"],
                "志愿统计数据": row["志愿统计"],
                "可选年级列表": row["可选年级列表"],
            }
        )
    return result


@app.get("/课程列表", summary="获取课程列表")
async def 获取课程列表():
    return {"状态": "成功", "消息": "获取课程列表成功", "数据": {"课程列表": 返回课程列表()}}


@app.post("/上传课程数据", summary="上传课程数据")
async def 上传课程数据(file: UploadFile = File(...)):
    global 课程表
    if not file.filename.lower().endswith(".csv"):
        return {"状态": "失败", "消息": "请上传 CSV 文件", "数据": {}}

    content = await file.read()
    if not content:
        return {"状态": "失败", "消息": "上传文件为空", "数据": {}}

    try:
        df = pd.read_csv(StringIO(content.decode("utf-8-sig")))
    except Exception as exc:
        return {"状态": "失败", "消息": f"CSV 解析失败：{exc}", "数据": {}}

    missing_columns = [column for column in 必要字段 if column not in df.columns]
    if missing_columns:
        return {"状态": "失败", "消息": "CSV 缺少必要字段", "数据": {"缺少字段": missing_columns}}

    df = df[必要字段].copy()
    df["course_id"] = df["course_id"].astype(str)
    df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce")
    df["current_enrollment"] = pd.to_numeric(df["current_enrollment"], errors="coerce")
    df["可选年级列表"] = df["available_grades"].apply(解析可选年级)

    if df["capacity"].isna().any() or df["current_enrollment"].isna().any():
        return {"状态": "失败", "消息": "容量或选课人数存在无效数字", "数据": {}}

    df["capacity"] = df["capacity"].astype(int)
    df["current_enrollment"] = df["current_enrollment"].astype(int)

    if (df["capacity"] < 0).any() or (df["current_enrollment"] < 0).any():
        return {"状态": "失败", "消息": "容量和选课人数不能为负数", "数据": {}}

    invalid_types = sorted(set(df["course_type"].astype(str)) - {"普通必修", "普通选修"})
    if invalid_types:
        return {"状态": "失败", "消息": "course_type 只允许 普通必修 或 普通选修", "数据": {"错误类型": invalid_types}}

    df["校区容量"] = df.apply(初始化校区容量, axis=1)
    df["校区人数"] = df.apply(初始化校区人数, axis=1)
    df["班级容量"] = df.apply(初始化班级容量, axis=1)
    df["志愿统计"] = df.apply(初始化志愿统计, axis=1)
    课程表 = df
    for index in 课程表.index:
        if str(课程表.at[index, "course_type"]) == "普通必修":
            同步普通必修校区已选课人数(index)
    更新显示列()
    保存状态()

    return {"状态": "成功", "消息": "课程数据上传成功", "数据": {"课程数量": int(len(课程表)), "课程列表": 返回课程列表()}}


@app.post("/设置选课人数", summary="设置选课人数")
async def 设置选课人数(request: 设置人数请求):
    global 课程表
    if 课程表.empty:
        return {"状态": "失败", "消息": "请先上传课程数据", "数据": {}}
    if request.当前人数 < 0:
        return {"状态": "失败", "消息": "人数不能为负数", "数据": {}}

    matched = 课程表["course_id"] == request.course_id
    if not matched.any():
        return {"状态": "失败", "消息": "未找到课程", "数据": {}}

    index = 课程表[matched].index[0]
    if request.校区 not in 课程表.at[index, "校区容量"]:
        return {"状态": "失败", "消息": "该课程不在此校区开设", "数据": {}}

    if request.类型 == "已选课人数":
        if str(课程表.at[index, "course_type"]) == "普通必修":
            return {"状态": "失败", "消息": "普通必修课请直接设置 A班/B班 的一志愿或二志愿人数", "数据": {}}
        counts = dict(课程表.at[index, "校区人数"])
        counts[request.校区] = int(request.当前人数)
        课程表.at[index, "校区人数"] = counts
    elif request.类型 in {"A班一志愿人数", "A班二志愿人数", "B班一志愿人数", "B班二志愿人数"}:
        choice_counts = dict(课程表.at[index, "志愿统计"])
        if not choice_counts:
            return {"状态": "失败", "消息": "该课程不是普通必修双班课程", "数据": {}}
        campus_counts = dict(
            choice_counts.get(
                request.校区,
                {"A班一志愿人数": 0, "A班二志愿人数": 0, "B班一志愿人数": 0, "B班二志愿人数": 0},
            )
        )
        campus_counts[request.类型] = int(request.当前人数)
        choice_counts[request.校区] = campus_counts
        课程表.at[index, "志愿统计"] = choice_counts
        同步普通必修校区已选课人数(index)
    else:
        return {"状态": "失败", "消息": "类型无效", "数据": {}}

    更新显示列()
    保存状态()
    return {"状态": "成功", "消息": "人数保存成功", "数据": {"课程ID": request.course_id, "校区": request.校区, "类型": request.类型}}


@app.post("/随机生成初始人数", summary="随机生成初始人数")
async def 随机生成初始人数接口():
    if 课程表.empty:
        return {"状态": "失败", "消息": "请先上传课程数据", "数据": {}}
    随机生成初始人数()
    return {
        "状态": "成功",
        "消息": "已随机生成初始选课人数",
        "数据": {"课程列表": 返回课程列表()},
    }


@app.post("/学生选课", summary="学生选课")
async def 学生选课(request: 学生选课请求):
    global 课程表
    if 课程表.empty:
        return {"状态": "失败", "消息": "请先上传课程数据", "结果": [], "冲突提示": "", "校区限制提示": "", "通勤提示": ""}

    if not 年级合法(request.学生类型, request.年级):
        return {"状态": "失败", "消息": "当前学生类型与年级不匹配", "结果": [], "冲突提示": "", "校区限制提示": "", "通勤提示": ""}

    student_campus = 实际校区(request.年级, request.学生校区)
    allowed_types = 获取允许类型(request.学生类型)
    normal_courses = set(request.普通课程)
    required_course_ids = {item.课程ID for item in request.必修班级志愿}
    selected_course_ids = list(normal_courses | required_course_ids)

    if not selected_course_ids:
        return {"状态": "失败", "消息": "请至少选择一门课程", "结果": [], "冲突提示": "", "校区限制提示": "", "通勤提示": ""}

    selected_df = 课程表[课程表["course_id"].isin(selected_course_ids)].copy()
    invalid_names = []
    invalid_ids = set()
    time_slots = []

    for _, row in selected_df.iterrows():
        if str(row["course_type"]) not in allowed_types:
            invalid_names.append(str(row["course_name"]))
            invalid_ids.add(str(row["course_id"]))
            continue
        if not 课程适用于校区(row, student_campus):
            invalid_names.append(str(row["course_name"]))
            invalid_ids.add(str(row["course_id"]))
            continue
        if not 课程适用于年级(row, request.年级):
            invalid_names.append(f"{row['course_name']}（年级不可选）")
            invalid_ids.add(str(row["course_id"]))
            continue
        time_slots.append(str(row["time_slot"]))

    conflict_message = "所选课程存在时间冲突" if len(time_slots) != len(set(time_slots)) else "所选课程没有时间冲突"
    campus_message = f"以下课程不可选：{'、'.join(invalid_names)}" if invalid_names else "所选课程均符合校区和年级限制"
    commute_message = "大一学生默认在新校区；本次已按实际校区规则处理" if request.年级 == "大一" else "没有跨校区选课尝试"

    results = []
    for _, row in selected_df.iterrows():
        course_id = str(row["course_id"])
        if course_id in invalid_ids:
            continue

        course_name = str(row["course_name"])
        course_type = str(row["course_type"])
        index = 课程表[课程表["course_id"] == course_id].index[0]
        weight = (
            课程类型权重.get(course_type, 0.6)
            * 课程年级权重(course_type, request.年级)
            * 学生类型权重.get(request.学生类型, 0.8)
        )

        if course_type == "普通必修":
            wish = next((item for item in request.必修班级志愿 if item.课程ID == course_id), None)
            if wish is None:
                results.append({"课程名称": course_name, "是否选上": False, "说明": "未填写班级志愿"})
                continue

            first_choice = wish.一志愿.strip()
            second_choice = wish.二志愿.strip()
            valid_choices = {"", "A班", "B班"}
            if first_choice not in valid_choices or second_choice not in valid_choices:
                results.append({"课程名称": course_name, "是否选上": False, "说明": "志愿只能选择 A班、B班 或 空"})
                continue
            if first_choice == "" and second_choice != "":
                results.append({"课程名称": course_name, "是否选上": False, "说明": "不能只填写二志愿"})
                continue
            if first_choice == "":
                results.append({"课程名称": course_name, "是否选上": False, "说明": "未填写班级志愿"})
                continue
            if first_choice != "" and first_choice == second_choice:
                results.append({"课程名称": course_name, "是否选上": False, "说明": "一志愿和二志愿不能相同"})
                continue

            class_capacity = dict(课程表.at[index, "班级容量"])
            choice_counts = dict(课程表.at[index, "志愿统计"])
            campus_choice_counts = dict(
                choice_counts.get(
                    student_campus,
                    {"A班一志愿人数": 0, "A班二志愿人数": 0, "B班一志愿人数": 0, "B班二志愿人数": 0},
                )
            )
            campus_class_capacity = dict(class_capacity.get(student_campus, {"A班": 0, "B班": 0}))

            selected_keys = []
            if first_choice == "A班":
                selected_keys.append("A班一志愿人数")
            elif first_choice == "B班":
                selected_keys.append("B班一志愿人数")
            if second_choice == "A班":
                selected_keys.append("A班二志愿人数")
            elif second_choice == "B班":
                selected_keys.append("B班二志愿人数")

            for key in selected_keys:
                campus_choice_counts[key] = int(campus_choice_counts.get(key, 0)) + 1
            choice_counts[student_campus] = campus_choice_counts
            课程表.at[index, "志愿统计"] = choice_counts
            同步普通必修校区已选课人数(index)

            candidate_sequence = []
            if first_choice:
                candidate_sequence.append((first_choice, "一志愿"))
            if second_choice:
                candidate_sequence.append((second_choice, "二志愿"))

            admitted = False
            for class_name, priority_name in candidate_sequence:
                class_demand = (
                    int(campus_choice_counts.get(f"{class_name}一志愿人数", 0))
                    + int(campus_choice_counts.get(f"{class_name}二志愿人数", 0))
                )
                class_capacity_value = int(campus_class_capacity.get(class_name, 0))
                if 概率录取(class_capacity_value, class_demand, weight):
                    results.append({"课程名称": f"{course_name}（{class_name}）", "是否选上": True, "说明": f"{priority_name}录取成功"})
                    admitted = True
                    break

            if not admitted:
                results.append({"课程名称": course_name, "是否选上": False, "说明": "所填班级志愿均未录取"})
        else:
            campus_capacity = dict(课程表.at[index, "校区容量"])
            campus_counts = dict(课程表.at[index, "校区人数"])
            local_capacity = int(campus_capacity.get(student_campus, 0))
            local_count = int(campus_counts.get(student_campus, 0)) + 1
            campus_counts[student_campus] = local_count
            课程表.at[index, "校区人数"] = campus_counts
            admitted = 概率录取(local_capacity, local_count, weight)
            results.append(
                {
                    "课程名称": course_name,
                    "是否选上": admitted,
                    "说明": (
                        f"普通概率录取，学生优先系数 {学生类型权重.get(request.学生类型, 0.8):.2f}，"
                        f"年级系数 {课程年级权重(course_type, request.年级):.2f}"
                    ),
                }
            )

    更新显示列()
    保存状态()
    return {"状态": "成功", "结果": results, "冲突提示": conflict_message, "校区限制提示": campus_message, "通勤提示": commute_message}


加载状态()

if 前端构建目录.exists():
    资源目录 = 前端构建目录 / "assets"
    if 资源目录.exists():
        app.mount("/assets", StaticFiles(directory=str(资源目录)), name="assets")


@app.get("/", include_in_schema=False)
async def 前端首页():
    index_file = 前端构建目录 / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"状态": "失败", "消息": "前端尚未构建", "数据": {}}


@app.get("/{full_path:path}", include_in_schema=False)
async def 前端路由(full_path: str):
    file_path = 前端构建目录 / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    index_file = 前端构建目录 / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"状态": "失败", "消息": "前端尚未构建", "数据": {}}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
