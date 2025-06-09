// 课程探索工具 - 主应用程序
class CourseExplorer {
    constructor() {
        this.courseData = {};        this.state = {
            selectedGrade: '2024',
            selectedSemester: 'all',
            selectedDirection: 'all',
            favorites: JSON.parse(localStorage.getItem('courseFavorites') || '[]'),
            searchQuery: '',
            selectedCourses: JSON.parse(localStorage.getItem('selectedCourses') || '[]'),
            viewMode: 'grid', // grid, schedule, recommendations
            // 新增筛选状态
            showFavorites: false,
            showSelected: false,
            filtersExpanded: false
        };
        
        this.init();
    }
    
    // 初始化应用
    async init() {
        try {
            await this.loadCourseData();
            this.bindEvents();
            this.render();
        } catch (error) {
            console.error('初始化失败:', error);
            this.renderError('加载课程数据失败，请检查网络连接或联系管理员。');
        }
    }
    
    // 加载课程数据
    async loadCourseData() {
        try {
            const response = await fetch('./deduplicated_schedule_data.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this.courseData = await response.json();
            console.log('课程数据加载成功:', this.courseData);
        } catch (error) {
            console.error('加载课程数据失败:', error);
            throw error;
        }
    }    // 绑定事件
    bindEvents() {
        // 全局事件监听
        document.addEventListener('click', (e) => {
            // 阻止事件冒泡处理
            let target = e.target;
            
            // 向上查找带有data-action的元素
            while (target && target !== document) {
                if (target.hasAttribute && target.hasAttribute('data-action')) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const action = target.dataset.action;
                    const params = target.dataset.params ? JSON.parse(target.dataset.params) : {};
                    this.handleAction(action, params, target);
                    return;
                }
                target = target.parentElement;
            }
            
            // 模态框背景点击关闭
            if (e.target.matches('.modal-overlay')) {
                this.closeModal();
            }
        });
        
        // 搜索框事件
        document.addEventListener('input', (e) => {
            if (e.target.matches('#searchInput')) {
                this.debounce(() => {
                    this.updateState({ searchQuery: e.target.value });
                }, 300)();
            }
        });
        
        // 快捷键支持
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                document.getElementById('searchInput')?.focus();
            }
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }
    
    // 处理用户操作
    handleAction(action, params, element) {
        switch (action) {            case 'filter':
                this.updateFilter(params.key, params.value);
                break;
            case 'toggleFilter':
                this.toggleFilter(params.key);
                break;
            case 'toggleFiltersExpanded':
                this.updateState({ filtersExpanded: !this.state.filtersExpanded });
                break;
            case 'toggleFavorite':
                this.toggleFavorite(params.courseName);
                break;
            case 'toggleSelection':
                this.toggleCourseSelection(params.course);
                break;
            case 'clearFilters':
                this.clearAllFilters();
                break;            case 'clearSelected':
                this.clearSelectedCourses();
                break;
            case 'exportSchedule':
                this.exportSchedule();
                break;
            case 'showCourseDetail':
                this.showCourseDetail(params.course);
                break;
            case 'closeModal':
                this.closeModal();
                break;
            default:
                console.warn('未知操作:', action);
        }
    }
    
    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // 更新应用状态
    updateState(newState) {
        this.state = { ...this.state, ...newState };
        this.saveToLocalStorage();
        this.render();
    }
    
    // 更新筛选器
    updateFilter(key, value) {
        this.updateState({ [key]: value });
    }    // 清除所有筛选器
    clearAllFilters() {
        this.updateState({
            selectedGrade: 'all',
            selectedSemester: 'all',
            selectedDirection: 'all',
            searchQuery: '',
            showFavorites: false,
            showSelected: false
        });
        document.getElementById('searchInput').value = '';
    }
    
    // 清空已选课程
    clearSelectedCourses() {
        this.updateState({ selectedCourses: [] });
        this.showToast('已清空所有选课', 'info');
    }
    
    // 切换收藏状态
    toggleFavorite(courseName) {
        const favorites = [...this.state.favorites];
        const index = favorites.indexOf(courseName);
        
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(courseName);
        }
        
        this.updateState({ favorites });
        this.showToast(index > -1 ? '已取消收藏' : '已添加到收藏', 'success');
    }    // 切换选课状态 - 修改为允许冲突选择并保持列表位置
    toggleCourseSelection(course) {
        // 保存滚动位置
        this.saveListScrollPosition();
        
        const selectedCourses = [...this.state.selectedCourses];
        const index = selectedCourses.findIndex(c => c.name === course.name);
        
        if (index > -1) {
            selectedCourses.splice(index, 1);
            this.showToast('已移除课程', 'info');
        } else {
            // 检查时间冲突但不阻止选择
            const conflicts = this.detectTimeConflicts([...selectedCourses, course]);
            if (conflicts.length > 0) {
                const conflict = conflicts[0];
                this.showToast(`与《${conflict.course1}》时间冲突！但已添加到选课列表`, 'warning');
            } else {
                this.showToast('已添加课程', 'success');
            }
            
            selectedCourses.push(course);
        }
        
        this.updateState({ selectedCourses });
        
        // 恢复滚动位置
        this.restoreListScrollPosition();
    }
    
    // 切换筛选器状态
    toggleFilter(key) {
        this.updateState({ [key]: !this.state[key] });
    }
    
    // 保存列表滚动位置
    saveListScrollPosition() {
        const listContainer = document.querySelector('.view-main .view-content');
        if (listContainer) {
            this.listScrollPosition = listContainer.scrollTop;
        }
    }
    
    // 恢复列表滚动位置
    restoreListScrollPosition() {
        setTimeout(() => {
            const listContainer = document.querySelector('.view-main .view-content');
            if (listContainer && this.listScrollPosition !== undefined) {
                listContainer.scrollTop = this.listScrollPosition;
            }
        }, 50);
    }

    // 保存到本地存储
    saveToLocalStorage() {
        try {
            localStorage.setItem('courseFavorites', JSON.stringify(this.state.favorites));
            localStorage.setItem('selectedCourses', JSON.stringify(this.state.selectedCourses));
        } catch (error) {
            console.error('保存到本地存储失败:', error);
        }
    }
    
    // 获取所有课程
    getAllCourses() {
        let allCourses = [];
        
        if (!this.courseData.schedule_data) return allCourses;
        
        Object.entries(this.courseData.schedule_data).forEach(([grade, gradeData]) => {
            Object.entries(gradeData).forEach(([semester, semesterData]) => {
                if (Array.isArray(semesterData)) {
                    allCourses.push(...semesterData);
                } else if (typeof semesterData === 'object' && semesterData !== null) {
                    Object.entries(semesterData).forEach(([direction, courses]) => {
                        if (Array.isArray(courses)) {
                            allCourses.push(...courses);
                        }
                    });
                }
            });
        });
        
        // 去重
        const uniqueCourses = allCourses.filter((course, index, arr) => 
            arr.findIndex(c => c.name === course.name && c.grade === course.grade && c.semester === course.semester) === index
        );
        
        return uniqueCourses;
    }
      // 获取筛选后的课程
    getFilteredCourses() {
        let courses = this.getAllCourses();
        
        // 按年级筛选
        if (this.state.selectedGrade !== 'all') {
            courses = courses.filter(course => course.grade === this.state.selectedGrade);
        }
        
        // 按学期筛选
        if (this.state.selectedSemester !== 'all') {
            courses = courses.filter(course => course.semester.toString() === this.state.selectedSemester);
        }
        
        // 按方向筛选
        if (this.state.selectedDirection !== 'all') {
            courses = courses.filter(course => course.direction === this.state.selectedDirection);
        }
        
        // 搜索筛选
        if (this.state.searchQuery) {
            const query = this.state.searchQuery.toLowerCase();
            courses = courses.filter(course => 
                course.name.toLowerCase().includes(query) ||
                (course.teachers && course.teachers.some(teacher => 
                    teacher.toLowerCase().includes(query)
                )) ||
                (course.description && course.description.toLowerCase().includes(query))
            );
        }
        
        // 收藏课程筛选
        if (this.state.showFavorites) {
            courses = courses.filter(course => this.state.favorites.includes(course.name));
        }
        
        // 已选课程筛选
        if (this.state.showSelected) {
            courses = courses.filter(course => 
                this.state.selectedCourses.some(selected => selected.name === course.name)
            );
        }
        
        return courses;
    }
    
    // 检测时间冲突
    detectTimeConflicts(courses) {
        const conflicts = [];
        
        for (let i = 0; i < courses.length; i++) {
            for (let j = i + 1; j < courses.length; j++) {
                const course1 = courses[i];
                const course2 = courses[j];
                
                if (!course1.time_slots || !course2.time_slots) continue;
                
                const hasConflict = course1.time_slots.some(slot1 =>
                    course2.time_slots.some(slot2 =>
                        slot1.weekday === slot2.weekday && 
                        slot1.period === slot2.period
                    )
                );
                
                if (hasConflict) {
                    const conflictTime = course1.time_slots.find(slot1 =>
                        course2.time_slots.some(slot2 =>
                            slot1.weekday === slot2.weekday && 
                            slot1.period === slot2.period
                        )
                    );
                    
                    conflicts.push({
                        course1: course1.name,
                        course2: course2.name,
                        conflictTime: conflictTime
                    });
                }
            }
        }
        
        return conflicts;
    }
      // 获取课程类型样式
    getCourseTypeStyle(course) {
        if (course.type?.includes('强基') || course.type?.includes('拔尖')) {
            return { 
                className: 'course-type-required', 
                label: '强基班', 
                icon: 'star',
                color: 'linear-gradient(135deg, #fbbf24, #f59e0b)'
            };
        }
        if (course.type === '小学期选修') {
            return { 
                className: 'course-type-summer', 
                label: '小学期', 
                icon: 'sun',
                color: 'linear-gradient(135deg, #f97316, #ea580c)'
            };
        }
        if (course.direction === '统计学') {
            return { 
                className: 'course-type-stats', 
                label: '统计学', 
                icon: 'bar-chart',
                color: 'linear-gradient(135deg, #10b981, #059669)'
            };
        }
        if (course.direction === '数学') {
            return { 
                className: 'course-type-math', 
                label: '数学', 
                icon: 'calculator',
                color: 'linear-gradient(135deg, #3b82f6, #2563eb)'
            };
        }
        
        // 根据课程名称判断必修/选修
        const requiredCourses = ['数学分析', '高等代数', '概率论', '数理统计', '大学英语', '大学物理', '思想道德', '形势与政策'];
        const isRequired = requiredCourses.some(req => course.name.includes(req));
        
        return isRequired 
            ? { 
                className: 'course-type-required', 
                label: '必修', 
                icon: 'book-open',
                color: 'linear-gradient(135deg, #ef4444, #dc2626)'
            }
            : { 
                className: 'course-type-elective', 
                label: '选修', 
                icon: 'book',
                color: 'linear-gradient(135deg, #6b7280, #4b5563)'
            };
    }      // 获取推荐课程
    getRecommendedCourses() {
        const selectedNames = this.state.selectedCourses.map(c => c.name);
        
        // 1. 首先应用筛选条件获取符合条件的课程
        let available = this.getFilteredCourses().filter(c => !selectedNames.includes(c.name));
        
        // 2. 过滤掉与已选课程冲突的课程
        available = available.filter(course => {
            const testCourses = [...this.state.selectedCourses, course];
            const conflicts = this.detectTimeConflicts(testCourses);
            return conflicts.length === 0; // 只推荐无冲突的课程
        });
        
        // 3. 按优先级排序：必修 -> 选修 -> 小学期，然后按学分排序
        const recommendations = available.map(course => {
            const typeStyle = this.getCourseTypeStyle(course);
            let priority = 0;
            
            // 课程类型优先级
            if (typeStyle.label === '必修' || typeStyle.label === '强基班') {
                priority = 3; // 最高优先级
            } else if (typeStyle.label === '选修' || typeStyle.label === '数学' || typeStyle.label === '统计学') {
                priority = 2; // 中等优先级
            } else if (typeStyle.label === '小学期') {
                priority = 1; // 最低优先级
            }
            
            return { 
                ...course, 
                priority,
                credits: course.credits || 3
            };
        });
        
        // 4. 排序：优先级 -> 学分（降序）
        return recommendations
            .sort((a, b) => {
                // 首先按优先级排序（高优先级在前）
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                // 同优先级按学分排序（学分高的在前）
                return b.credits - a.credits;
            })
            .slice(0, 8); // 增加推荐数量到8个
    }
    
    // 判断课程是否相关
    areCoursesRelated(course1, course2) {
        const mathKeywords = ['数学分析', '高等代数', '线性代数', '几何', '拓扑'];
        const statsKeywords = ['概率', '统计', '随机', '数据'];
        const physicsKeywords = ['物理', '力学'];
        const programmingKeywords = ['程序', '编程', 'C语言', 'Python', 'Matlab'];
        
        const keywordGroups = [mathKeywords, statsKeywords, physicsKeywords, programmingKeywords];
        
        return keywordGroups.some(group => 
            group.some(keyword => course1.includes(keyword)) &&
            group.some(keyword => course2.includes(keyword))
        );
    }
    
    // 显示提示消息
    showToast(message, type = 'info') {
        // 移除现有的toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            font-weight: 500;
            max-width: 300px;
        `;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
      // 导出课程表为CSV格式
    exportSchedule() {
        if (this.state.selectedCourses.length === 0) {
            this.showToast('没有选择任何课程', 'warning');
            return;
        }
        
        // CSV 头部
        const headers = [
            '课程名称',
            '授课教师', 
            '学分',
            '年级',
            '学期',
            '专业方向',
            '课程类型',
            '上课时间',
            '上课地点',
            '是否冲突'
        ];
        
        // 检测冲突
        const conflicts = this.detectTimeConflicts(this.state.selectedCourses);
        const conflictCourseNames = new Set();
        conflicts.forEach(conflict => {
            conflictCourseNames.add(conflict.course1);
            conflictCourseNames.add(conflict.course2);
        });
        
        // 生成CSV数据
        const csvData = [
            headers.join(','),
            ...this.state.selectedCourses.map(course => {
                const typeInfo = this.getCourseTypeStyle(course);
                const timeSlots = course.time_slots ? 
                    course.time_slots.map(slot => `${slot.weekday} ${slot.period}`).join('; ') : '';
                const rooms = course.rooms ? course.rooms.join('; ') : '';
                const teachers = course.teachers ? course.teachers.join('; ') : '';
                const hasConflict = conflictCourseNames.has(course.name) ? '是' : '否';
                
                return [
                    `"${course.name}"`,
                    `"${teachers}"`,
                    course.credits || 3,
                    course.grade,
                    course.semester,
                    `"${course.direction || ''}"`,
                    `"${typeInfo.label}"`,
                    `"${timeSlots}"`,
                    `"${rooms}"`,
                    hasConflict
                ].join(',');
            })
        ].join('\n');
        
        // 添加统计信息
        const totalCredits = this.state.selectedCourses.reduce((sum, course) => sum + (course.credits || 3), 0);
        const stats = [
            '',
            '统计信息',
            `总课程数,${this.state.selectedCourses.length}`,
            `总学分,${totalCredits}`,
            `时间冲突数,${conflicts.length}`,
            `导出时间,"${new Date().toLocaleString('zh-CN')}"`
        ].join('\n');
        
        const finalCsvData = csvData + '\n' + stats;
        
        // 创建下载
        const dataBlob = new Blob(['\uFEFF' + finalCsvData], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `课程表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
        link.click();
        
        this.showToast('课程表已导出为CSV格式', 'success');
    }
      // 显示课程详情模态框
    showCourseDetail(course) {
        const modal = document.getElementById('courseDetailModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        if (!modal || !modalTitle || !modalBody) {
            console.error('模态框元素未找到');
            return;
        }
        
        modalTitle.textContent = course.name;
        
        const isSelected = this.state.selectedCourses.some(c => c.name === course.name);
        const isFavorite = this.state.favorites.includes(course.name);
        const hasConflict = isSelected && this.detectTimeConflicts(this.state.selectedCourses).some(
            conflict => conflict.course1 === course.name || conflict.course2 === course.name
        );
        const typeInfo = this.getCourseTypeStyle(course);
        
        modalBody.innerHTML = `
            <div class="course-detail-modal">
                <div class="course-detail-header">
                    <span class="course-type-badge" style="background: ${typeInfo.color}">
                        ${typeInfo.label}
                    </span>
                    <span class="course-credits">${course.credits || 3} 学分</span>
                    ${hasConflict ? '<span class="conflict-badge">时间冲突</span>' : ''}
                </div>
                
                <div class="course-detail-info">
                    ${course.teachers && course.teachers.length > 0 ? `
                        <div class="detail-row">
                            <i data-lucide="user" class="detail-icon"></i>
                            <span><strong>授课教师：</strong>${course.teachers.join(' / ')}</span>
                        </div>
                    ` : ''}
                    
                    ${course.rooms && course.rooms.length > 0 ? `
                        <div class="detail-row">
                            <i data-lucide="map-pin" class="detail-icon"></i>
                            <span><strong>上课地点：</strong>${course.rooms.join(' / ')}</span>
                        </div>
                    ` : ''}
                    
                    ${course.time_slots && course.time_slots.length > 0 ? `
                        <div class="detail-row">
                            <i data-lucide="clock" class="detail-icon"></i>
                            <span><strong>上课时间：</strong></span>
                        </div>
                        <div class="time-slots-detail">
                            ${course.time_slots.map(slot => `
                                <div class="time-slot-detail">
                                    ${slot.weekday} ${slot.period}
                                    ${slot.note ? `<span class="time-note">(${slot.note})</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="detail-row">
                        <i data-lucide="calendar" class="detail-icon"></i>
                        <span><strong>年级学期：</strong>${course.grade}级 第${course.semester}学期</span>
                    </div>
                    
                    ${course.direction ? `
                        <div class="detail-row">
                            <i data-lucide="compass" class="detail-icon"></i>
                            <span><strong>专业方向：</strong>${course.direction}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${course.description ? `
                    <div class="course-description-modal">
                        <h4>课程描述</h4>
                        <p>${course.description}</p>
                    </div>
                ` : ''}
                
                <div class="modal-actions">
                    <button class="btn ${isFavorite ? 'btn-secondary' : 'btn-outline'}" 
                            data-action="toggleFavorite" 
                            data-params='${JSON.stringify({courseName: course.name})}'>
                        <i data-lucide="heart"></i>
                        ${isFavorite ? '取消收藏' : '添加收藏'}
                    </button>
                    <button class="btn ${isSelected ? 'btn-danger' : 'btn-primary'}" 
                            data-action="toggleSelection" 
                            data-params='${JSON.stringify({course})}'>
                        <i data-lucide="${isSelected ? 'minus' : 'plus'}"></i>
                        ${isSelected ? '取消选择' : '选择课程'}
                    </button>
                </div>
            </div>
        `;
        
        // 初始化图标
        this.initializeIcons();
        
        // 显示模态框
        modal.classList.remove('hidden');
        modal.classList.add('show');
        
        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
    }
    
    // 关闭模态框
    closeModal() {
        const modal = document.getElementById('courseDetailModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }
    }

    // 渲染主应用
    render() {
        const app = document.getElementById('app');
        if (!app) {
            console.error('找不到应用容器元素 #app');
            return;
        }
        
        const filteredCourses = this.getFilteredCourses();
        const allCourses = this.getAllCourses();
        const conflicts = this.detectTimeConflicts(this.state.selectedCourses);
        
        app.innerHTML = `
            <div class="min-h-screen py-4">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    ${this.renderHeroSection(allCourses)}
                    ${this.renderStatsSection(filteredCourses, conflicts)}
                    ${conflicts.length > 0 ? this.renderConflictWarning(conflicts) : ''}
                    ${this.renderFilterSection()}
                      <!-- 两视图布局 -->
                    <div class="two-view-layout">
                        <!-- 课程列表视图 (主要位置，更大) -->
                        <div class="view-section view-main">
                            <div class="view-title">
                                <i data-lucide="grid"></i>
                                课程列表 (${filteredCourses.length})
                            </div>
                            <div class="view-content">
                                ${this.renderCoursesGridSimple(filteredCourses)}
                            </div>
                        </div>
                        
                        <!-- 推荐课程视图 -->
                        <div class="view-section view-side">
                            <div class="view-title">
                                <i data-lucide="lightbulb"></i>
                                推荐课程
                            </div>
                            <div class="view-content">
                                ${this.renderRecommendationsCompact()}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 课程表视图 (底部，完整宽度) -->
                    <div class="schedule-section">                        <div class="view-title">
                            <i data-lucide="calendar"></i>
                            我的课程表
                            <div class="schedule-actions">
                                ${this.state.selectedCourses.length > 0 ? `
                                    <button class="btn btn-sm btn-secondary" data-action="exportSchedule" title="导出我的课程表为CSV格式">
                                        <i data-lucide="download"></i>
                                        导出
                                    </button>
                                    <button class="btn btn-sm btn-secondary" data-action="clearSelected" title="清空所有选课">
                                        <i data-lucide="trash-2"></i>
                                        清空
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="view-content">
                            ${this.renderScheduleWithCards()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 初始化图标
        this.initializeIcons();
        
        // 更新筛选器状态
        this.updateFilterUI();
    }
    
    // 渲染英雄区域
    renderHeroSection(allCourses) {
        const totalCredits = this.state.selectedCourses.reduce((sum, course) => sum + (course.credits || 3), 0);
        
        return `
            <section class="hero-section">
                <h1 class="hero-title animate-fade-in">
                    数学学院课程探索工具
                </h1>
                <p class="hero-subtitle animate-fade-in">
                    探索数学与统计学的知识宝库，智能规划您的学术之路
                </p>
                <div class="hero-stats animate-fade-in">
                    <div class="hero-stat">
                        <span class="hero-stat-number">${allCourses.length}</span>
                        <span class="hero-stat-label">门课程</span>
                    </div>
                    <div class="hero-stat">
                        <span class="hero-stat-number">${this.state.favorites.length}</span>
                        <span class="hero-stat-label">收藏课程</span>
                    </div>
                    <div class="hero-stat">
                        <span class="hero-stat-number">${this.state.selectedCourses.length}</span>
                        <span class="hero-stat-label">已选课程</span>
                    </div>
                    <div class="hero-stat">
                        <span class="hero-stat-number">${totalCredits}</span>
                        <span class="hero-stat-label">总学分</span>
                    </div>
                </div>
            </section>
        `;
    }
    
    // 渲染统计区域
    renderStatsSection(filteredCourses, conflicts) {
        const requiredCourses = filteredCourses.filter(course => 
            this.getCourseTypeStyle(course).label === '必修'
        );
        const electiveCourses = filteredCourses.filter(course => 
            this.getCourseTypeStyle(course).label === '选修'
        );
        
        return `
            <div class="stats-grid animate-slide-up">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i data-lucide="book-open"></i>
                    </div>
                    <div class="stat-number">${filteredCourses.length}</div>
                    <div class="stat-label">当前显示课程</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i data-lucide="bookmark"></i>
                    </div>
                    <div class="stat-number">${requiredCourses.length}</div>
                    <div class="stat-label">必修课程</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon">
                        <i data-lucide="book"></i>
                    </div>
                    <div class="stat-number">${electiveCourses.length}</div>
                    <div class="stat-label">选修课程</div>
                </div>
                
                <div class="stat-card ${conflicts.length > 0 ? 'border-red-200' : ''}">
                    <div class="stat-icon" style="background: ${conflicts.length > 0 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'var(--success-gradient)'}">
                        <i data-lucide="${conflicts.length > 0 ? 'alert-triangle' : 'check-circle'}"></i>
                    </div>
                    <div class="stat-number">${conflicts.length}</div>
                    <div class="stat-label">时间冲突</div>
                </div>
            </div>
        `;
    }
    
    // 渲染冲突警告
    renderConflictWarning(conflicts) {
        return `
            <div class="conflict-warning animate-scale-in">
                <div class="conflict-title">
                    <i data-lucide="alert-triangle"></i>
                    发现 ${conflicts.length} 个时间冲突
                </div>
                <div class="space-y-2">
                    ${conflicts.map(conflict => `
                        <div class="conflict-item">
                            <strong>《${conflict.course1}》</strong> 与 <strong>《${conflict.course2}》</strong> 
                            在 ${conflict.conflictTime.weekday} ${conflict.conflictTime.period} 有时间冲突
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
      // 渲染筛选区域
    renderFilterSection() {
        const grades = ['all', ...new Set(this.getAllCourses().map(c => c.grade))].sort().reverse();
        const semesters = ['all', '1', '2', '3'];
        const directions = ['all', '数学', '统计学'];
        
        return `
            <div class="filter-section animate-slide-up">
                <!-- 筛选器折叠按钮 -->
                <div class="filter-toggle" 
                     data-action="toggleFiltersExpanded">
                    <span class="filter-toggle-text">
                        <i data-lucide="${this.state.filtersExpanded ? 'chevron-up' : 'chevron-down'}"></i>
                        筛选选项 ${this.state.filtersExpanded ? '(点击收起)' : '(点击展开)'}
                    </span>
                    <div class="active-filters-summary">
                        ${this.getActiveFiltersCount() > 0 ? `已启用 ${this.getActiveFiltersCount()} 个筛选条件` : ''}
                    </div>
                </div>
                
                <!-- 筛选器内容 -->
                <div class="filter-content ${this.state.filtersExpanded ? 'expanded' : 'collapsed'}">
                    <div class="filter-grid-new">
                        <!-- 搜索框 -->
                        <div class="search-container">
                            <i data-lucide="search" class="search-icon"></i>
                            <input 
                                type="text" 
                                id="searchInput"
                                class="search-input" 
                                placeholder="搜索课程名称、教师..."
                                value="${this.state.searchQuery}"
                            >
                        </div>
                        
                        <!-- 快速筛选 -->
                        <div class="filter-group">
                            <label class="filter-label">快速筛选:</label>
                            <button class="filter-btn-toggle ${this.state.showFavorites ? 'active' : ''}"
                                    data-action="toggleFilter"
                                    data-params='{"key": "showFavorites"}'>
                                <i data-lucide="heart"></i>
                                收藏课程
                            </button>
                            <button class="filter-btn-toggle ${this.state.showSelected ? 'active' : ''}"
                                    data-action="toggleFilter"
                                    data-params='{"key": "showSelected"}'>
                                <i data-lucide="check-circle"></i>
                                已选课程
                            </button>
                        </div>
                        
                        <!-- 年级筛选 -->
                        <div class="filter-group">
                            <label class="filter-label">年级:</label>
                            <div class="filter-buttons">
                                ${grades.map(grade => `
                                    <button 
                                        class="filter-btn ${this.state.selectedGrade === grade ? 'active' : ''}"
                                        data-action="filter"
                                        data-params='{"key": "selectedGrade", "value": "${grade}"}'
                                    >
                                        ${grade === 'all' ? '全部' : grade + '级'}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- 学期筛选 -->
                        <div class="filter-group">
                            <label class="filter-label">学期:</label>
                            <div class="filter-buttons">
                                ${semesters.map(semester => `
                                    <button 
                                        class="filter-btn ${this.state.selectedSemester === semester ? 'active' : ''}"
                                        data-action="filter"
                                        data-params='{"key": "selectedSemester", "value": "${semester}"}'
                                    >
                                        ${semester === 'all' ? '全部' : '第' + semester + '学期'}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- 专业方向筛选 -->
                        <div class="filter-group">
                            <label class="filter-label">专业方向:</label>
                            <div class="filter-buttons">
                                ${directions.map(dir => `
                                    <button 
                                        class="filter-btn ${this.state.selectedDirection === dir ? 'active' : ''}"
                                        data-action="filter"
                                        data-params='{"key": "selectedDirection", "value": "${dir}"}'
                                    >
                                        ${dir === 'all' ? '全部' : dir}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- 操作按钮 -->
                        <div class="filter-actions">
                            <button 
                                class="btn btn-secondary btn-small"
                                data-action="clearFilters"
                            >
                                <i data-lucide="x"></i>
                                清除筛选
                            </button>
                            
                            ${this.state.selectedCourses.length > 0 ? `
                                <button 
                                    class="btn btn-secondary btn-small"
                                    data-action="clearSelected"
                                    title="清空所有选课"
                                >
                                    <i data-lucide="trash-2"></i>
                                    清空选课
                                </button>
                            ` : ''}
  
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 渲染课程网格
    renderCoursesGrid(courses) {
        if (courses.length === 0) {
            return this.renderEmptyState();
        }
        
        return `
            <div class="courses-grid">
                ${courses.map((course, index) => this.renderCourseCard(course, index)).join('')}
            </div>
        `;
    }
    
    // 渲染课程卡片
    renderCourseCard(course, index) {
        const typeStyle = this.getCourseTypeStyle(course);
        const isFavorite = this.state.favorites.includes(course.name);
        const isSelected = this.state.selectedCourses.some(c => c.name === course.name);
        
        return `
            <div class="course-card animate-fade-in" style="animation-delay: ${index * 0.1}s">
                <div class="course-header">
                    <div class="flex-1">
                        <div class="course-meta">
                            <span class="course-type-badge ${typeStyle.className}">
                                <i data-lucide="${typeStyle.icon}"></i>
                                ${typeStyle.label}
                            </span>
                            ${course.credits ? `
                                <span class="course-credits">${course.credits} 学分</span>
                            ` : ''}
                        </div>
                        <h3 class="course-title">${course.name}</h3>
                        <p class="course-subtitle">${course.grade}级 · 第${course.semester}学期</p>
                    </div>
                    
                    <div class="course-actions">
                        <button 
                            class="action-btn ${isFavorite ? 'favorite' : ''}"
                            data-action="toggleFavorite"
                            data-params='{"courseName": "${course.name}"}'
                            title="${isFavorite ? '取消收藏' : '添加收藏'}"
                        >
                            <i data-lucide="heart" ${isFavorite ? 'style="fill: currentColor"' : ''}></i>
                        </button>
                        <button 
                            class="action-btn ${isSelected ? 'selected' : ''}"
                            data-action="toggleSelection"
                            data-params='{"course": ${JSON.stringify(course).replace(/"/g, '&quot;')}}'
                            title="${isSelected ? '移除课程' : '添加课程'}"
                        >
                            <i data-lucide="${isSelected ? 'check' : 'plus'}"></i>
                        </button>
                    </div>
                </div>
                
                <div class="course-details">
                    ${course.weeks ? `
                        <div class="course-detail-row">
                            <i data-lucide="calendar" class="course-detail-icon"></i>
                            <span>${course.weeks}</span>
                        </div>
                    ` : ''}
                    
                    ${course.teachers && course.teachers.length > 0 ? `
                        <div class="course-detail-row">
                            <i data-lucide="user" class="course-detail-icon"></i>
                            <span>${course.teachers.join(' / ')}</span>
                        </div>
                    ` : ''}
                    
                    ${course.rooms && course.rooms.length > 0 ? `
                        <div class="course-detail-row">
                            <i data-lucide="map-pin" class="course-detail-icon"></i>
                            <span>${course.rooms.join(' / ')}</span>
                        </div>
                    ` : ''}
                    
                    ${course.time_slots && course.time_slots.length > 0 ? `
                        <div class="course-detail-row">
                            <i data-lucide="clock" class="course-detail-icon"></i>
                            <div class="time-slots">
                                ${course.time_slots.map(slot => `
                                    <span class="time-slot">
                                        ${slot.weekday} ${slot.period}
                                        ${slot.note ? `(${slot.note})` : ''}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                ${course.description ? `
                    <div class="course-description">
                        ${course.description}
                    </div>
                ` : ''}
            </div>
        `;
    }    // 渲染简化的课程网格（用于三视图布局）
    renderCoursesGridSimple(courses) {
        if (courses.length === 0) {
            return `
                <div class="text-center text-gray-500 py-8">
                    <i data-lucide="book-open" class="mx-auto mb-4 w-12 h-12 text-gray-400"></i>
                    <p>暂无符合条件的课程</p>
                </div>
            `;
        }
        
        return `
            <div class="courses-grid-simple">
                ${courses.map(course => {
                    const isSelected = this.state.selectedCourses.some(c => c.name === course.name);
                    const isFavorite = this.state.favorites.includes(course.name);
                    const hasConflict = this.detectTimeConflicts(this.state.selectedCourses).some(
                        conflict => conflict.course1 === course.name || conflict.course2 === course.name
                    );
                    const typeInfo = this.getCourseTypeStyle(course);
                    
                    return `
                        <div class="course-card-simple ${isSelected ? 'selected' : ''} ${hasConflict ? 'conflict' : ''}"
                             data-action="showCourseDetail"
                             data-params='${JSON.stringify({course})}'>
                            ${hasConflict ? '<div class="conflict-badge">冲突</div>' : ''}
                            
                            <div class="course-name">${course.name}</div>
                            <div class="course-meta">
                                <span class="course-type-badge" style="background: ${typeInfo.color}">
                                    ${typeInfo.label}
                                </span>
                                <span>${course.credits || 3} 学分</span>
                                ${course.teachers ? `<span>${course.teachers.join(', ')}</span>` : ''}
                            </div>
                            
                            <div class="course-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                                <button class="btn-icon ${isFavorite ? 'active' : ''}" 
                                        data-action="toggleFavorite" 
                                        data-params='${JSON.stringify({courseName: course.name})}'
                                        title="${isFavorite ? '取消收藏' : '添加收藏'}">
                                    <i data-lucide="${isFavorite ? 'heart' : 'heart'}" 
                                       style="width: 14px; height: 14px; ${isFavorite ? 'fill: #ef4444; color: #ef4444;' : ''}"></i>
                                </button>
                                <button class="btn-icon ${isSelected ? 'active' : ''}" 
                                        data-action="toggleSelection" 
                                        data-params='${JSON.stringify({course})}'
                                        title="${isSelected ? '取消选择' : '选择课程'}">
                                    <i data-lucide="${isSelected ? 'check' : 'plus'}" 
                                       style="width: 14px; height: 14px;"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
      // 渲染紧凑的课程表
    renderScheduleCompact() {
        if (this.state.selectedCourses.length === 0) {
            return `
                <div class="text-center text-gray-500 py-8">
                    <i data-lucide="calendar" class="mx-auto mb-4 w-12 h-12 text-gray-400"></i>
                    <p>暂无选中的课程</p>
                    <p class="text-sm">请从左侧课程列表中选择课程</p>
                </div>
            `;
        }
        
        const weekdays = ['周一', '周二', '周三', '周四', '周五'];
        const periods = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节'];
        
        // 创建时间表网格
        const scheduleGrid = {};
        weekdays.forEach(day => {
            scheduleGrid[day] = {};
            periods.forEach(period => {
                scheduleGrid[day][period] = [];
            });
        });
        
        // 填充选中的课程
        this.state.selectedCourses.forEach(course => {
            if (course.time_slots && Array.isArray(course.time_slots)) {
                course.time_slots.forEach(slot => {
                    const day = this.normalizeWeekday(slot.weekday);
                    const period = this.normalizePeriod(slot.period);
                    
                    // 调试信息
                    console.log('原始时间:', slot.weekday, slot.period);
                    console.log('标准化时间:', day, period);
                    
                    if (scheduleGrid[day] && scheduleGrid[day][period]) {
                        scheduleGrid[day][period].push({
                            ...course,
                            room: slot.room || course.rooms?.[0] || ''
                        });
                    } else {
                        console.warn('无法匹配时间段:', day, period);
                    }
                });
            }
        });
        
        return `
            <div class="schedule-compact">
                <div class="schedule-header">
                    <div class="schedule-day">时间</div>
                    ${periods.map(period => `<div class="schedule-period">${period}</div>`).join('')}
                </div>
                ${weekdays.map(day => `
                    <div class="schedule-row">
                        <div class="schedule-day">${day}</div>
                        ${periods.map(period => {
                            const courses = scheduleGrid[day][period];
                            return `
                                <div class="schedule-cell ${courses.length > 1 ? 'conflict' : ''}">
                                    ${courses.map(course => `
                                        <div class="schedule-course"
                                             data-action="toggleSelection"
                                             data-params='${JSON.stringify({course})}'
                                             title="点击取消选择: ${course.name}">
                                            <div class="schedule-course-name">${course.name}</div>
                                            ${course.room ? `<div class="schedule-course-room">${course.room}</div>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }    // 渲染紧凑的推荐课程
    renderRecommendationsCompact() {
        const recommendations = this.getRecommendedCourses();
        
        if (recommendations.length === 0) {
            return `
                <div class="text-center text-gray-500 py-8">
                    <i data-lucide="lightbulb" class="mx-auto mb-4 w-12 h-12 text-gray-400"></i>
                    <p>暂无推荐课程</p>
                    <p class="text-sm">选择一些课程后会显示相关推荐</p>
                </div>
            `;
        }
        
        return `
            <div class="recommendations-list">
                ${recommendations.map(course => {
                    const isSelected = this.state.selectedCourses.some(c => c.name === course.name);
                    const isFavorite = this.state.favorites.includes(course.name);
                    const typeInfo = this.getCourseTypeStyle(course);
                    
                    return `
                        <div class="course-card-simple ${isSelected ? 'selected' : ''}"
                             data-action="showCourseDetail"
                             data-params='${JSON.stringify({course})}'>
                            
                            <div class="course-name">${course.name}</div>
                            <div class="course-meta">
                                <span class="course-type-badge" style="background: ${typeInfo.color}">
                                    ${typeInfo.label}
                                </span>
                                <span>${course.credits || 3} 学分</span>
                                ${course.teachers ? `<span>${course.teachers.join(', ')}</span>` : ''}
                            </div>
                            
                            <div class="course-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                                <button class="btn-icon ${isFavorite ? 'active' : ''}" 
                                        data-action="toggleFavorite" 
                                        data-params='${JSON.stringify({courseName: course.name})}'
                                        title="${isFavorite ? '取消收藏' : '添加收藏'}">
                                    <i data-lucide="${isFavorite ? 'heart' : 'heart'}" 
                                       style="width: 14px; height: 14px; ${isFavorite ? 'fill: #ef4444; color: #ef4444;' : ''}"></i>
                                </button>
                                <button class="btn-icon ${isSelected ? 'active' : ''}" 
                                        data-action="toggleSelection" 
                                        data-params='${JSON.stringify({course})}'
                                        title="${isSelected ? '取消选择' : '选择课程'}">
                                    <i data-lucide="${isSelected ? 'check' : 'plus'}" 
                                       style="width: 14px; height: 14px;"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
      // 标准化星期格式
    normalizeWeekday(weekday) {
        const dayMap = {
            '星期一': '周一', '周一': '周一', 'Monday': '周一', '1': '周一',
            '星期二': '周二', '周二': '周二', 'Tuesday': '周二', '2': '周二',
            '星期三': '周三', '周三': '周三', 'Wednesday': '周三', '3': '周三',
            '星期四': '周四', '周四': '周四', 'Thursday': '周四', '4': '周四',
            '星期五': '周五', '周五': '周五', 'Friday': '周五', '5': '周五',
            '星期六': '周六', '周六': '周六', 'Saturday': '周六', '6': '周六',
            '星期日': '周日', '周日': '周日', 'Sunday': '周日', '7': '周日'
        };
        // 如果直接包含"周"字，直接返回
        if (weekday.includes('周')) return weekday;
        return dayMap[weekday] || weekday;
    }    // 标准化时间段格式
    normalizePeriod(period) {
        // 处理各种时间格式
        if (typeof period === 'string') {
            // 如果已经是标准格式，直接返回
            if (period.includes('节') && period.includes('-')) return period;
            
            // 处理"第一节"、"第二节"等格式
            if (period.includes('第一节') || period.includes('第二节')) return '1-2节';
            if (period.includes('第三节') || period.includes('第四节')) return '3-4节';
            if (period.includes('第五节') || period.includes('第六节')) return '5-6节';
            if (period.includes('第七节') || period.includes('第八节')) return '7-8节';
            if (period.includes('第九节') || period.includes('第十节')) return '9-10节';
            
            // 处理数字格式
            if (period.includes('1') && period.includes('2')) return '1-2节';
            if (period.includes('3') && period.includes('4')) return '3-4节';
            if (period.includes('5') && period.includes('6')) return '5-6节';
            if (period.includes('7') && period.includes('8')) return '7-8节';
            if (period.includes('9') && period.includes('10')) return '9-10节';
            
            // 处理单独的节次
            if (period === '1' || period === '2') return '1-2节';
            if (period === '3' || period === '4') return '3-4节';
            if (period === '5' || period === '6') return '5-6节';
            if (period === '7' || period === '8') return '7-8节';
            if (period === '9' || period === '10') return '9-10节';
        }        return period;
    }    // 渲染课程表（使用卡片格式）
    renderScheduleWithCards() {
        if (this.state.selectedCourses.length === 0) {
            return `
                <div class="text-center text-gray-500 py-8">
                    <i data-lucide="calendar" class="mx-auto mb-4 w-12 h-12 text-gray-400"></i>
                    <p>暂无选中的课程</p>
                    <p class="text-sm">请从上方课程列表中选择课程</p>
                </div>
            `;
        }

        const weekdays = ['周一', '周二', '周三', '周四', '周五'];
        const periods = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节'];
        
        // 创建时间表网格
        const scheduleGrid = {};
        weekdays.forEach(day => {
            scheduleGrid[day] = {};
            periods.forEach(period => {
                scheduleGrid[day][period] = [];
            });
        });
        
        // 填充选中的课程
        this.state.selectedCourses.forEach(course => {
            if (course.time_slots && Array.isArray(course.time_slots)) {
                course.time_slots.forEach(slot => {
                    const day = this.normalizeWeekday(slot.weekday);
                    const period = this.normalizePeriod(slot.period);
                    
                    if (scheduleGrid[day] && scheduleGrid[day][period]) {
                        scheduleGrid[day][period].push({
                            ...course,
                            room: slot.room || course.rooms?.[0] || ''
                        });
                    }
                });
            }
        });

        return `
            <div class="schedule-table-container">
                <table class="schedule-table">
                    <thead>
                        <tr>
                            <th class="schedule-time-header">时间/星期</th>
                            ${weekdays.map(day => `<th class="schedule-day-header">${day}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${periods.map(period => `
                            <tr>
                                <td class="schedule-period-cell">${period}</td>
                                ${weekdays.map(day => {
                                    const courses = scheduleGrid[day][period];
                                    return `
                                        <td class="schedule-cell ${courses.length > 1 ? 'conflict' : ''}">
                                            ${courses.map(course => {
                                                const typeInfo = this.getCourseTypeStyle(course);
                                                return `
                                                    <div class="schedule-course-card"
                                                         data-action="showCourseDetail"
                                                         data-params='${JSON.stringify({course})}'
                                                         title="${course.name}${course.room ? ' - ' + course.room : ''}">
                                                        <div class="schedule-course-name">${course.name}</div>
                                                        ${course.room ? `<div class="schedule-course-room">${course.room}</div>` : ''}
                                                        <div class="schedule-course-type" style="background: ${typeInfo.color}">
                                                            ${typeInfo.label}
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 渲染空状态
    renderEmptyState() {
        return `
            <div class="empty-state animate-fade-in">
                <div class="empty-state-icon">
                    <i data-lucide="book-open"></i>
                </div>
                <h3 class="empty-state-title">暂无课程</h3>
                <p class="empty-state-subtitle">请调整筛选条件或尝试搜索</p>
                <button class="btn btn-primary" data-action="clearFilters">
                    <i data-lucide="refresh-ccw"></i>
                    清除所有筛选
                </button>
            </div>
        `;
    }

    // 渲染错误状态
    renderError(message) {
        const app = document.getElementById('app');
        if (!app) return;
        
        app.innerHTML = `
            <div class="error-state animate-fade-in">
                <div class="error-state-icon">
                    <i data-lucide="alert-circle"></i>
                </div>
                <h3 class="error-state-title">加载失败</h3>
                <p class="error-state-subtitle">${message}</p>
                <button class="btn btn-primary" onclick="location.reload()">
                    <i data-lucide="refresh-ccw"></i>
                    重新加载
                </button>
            </div>
        `;
        
        this.initializeIcons();
    }

    // 获取活跃筛选条件数量
    getActiveFiltersCount() {
        let count = 0;
        if (this.state.selectedGrade !== 'all') count++;
        if (this.state.selectedSemester !== 'all') count++;
        if (this.state.selectedDirection !== 'all') count++;
        if (this.state.searchQuery) count++;
        if (this.state.showFavorites) count++;
        if (this.state.showSelected) count++;
        return count;
    }    // 更新筛选器UI状态
    updateFilterUI() {
        // 更新搜索框
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value !== this.state.searchQuery) {
            searchInput.value = this.state.searchQuery;
        }

        // 更新筛选按钮状态
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const params = JSON.parse(btn.dataset.params || '{}');
            const isActive = this.state[params.key] === params.value;
            btn.classList.toggle('active', isActive);
        });
        
        // 更新切换按钮状态
        document.querySelectorAll('.filter-btn-toggle').forEach(btn => {
            const params = JSON.parse(btn.dataset.params || '{}');
            const isActive = this.state[params.key] === true;
            btn.classList.toggle('active', isActive);
        });
    }

    // 初始化Lucide图标
    initializeIcons() {
        // 如果Lucide已加载，创建图标
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        } else {
            // 延迟重试
            setTimeout(() => this.initializeIcons(), 100);
        }
    }
}

// 应用程序入口
document.addEventListener('DOMContentLoaded', () => {
    window.courseExplorer = new CourseExplorer();
});
