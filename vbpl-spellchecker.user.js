// ==UserScript==
// @name         VBPL Spellchecker
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Tool check chính tả trên VBPL
// @author       DatND
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      vietnamese-wordlist.duyet.net
// @connect      raw.githubusercontent.com
// @connect      192.168.1.98
// ==/UserScript==

(function() {
    'use strict';

    let validSyllables = new Set();
    let validCompounds = new Set();
    let isChecking = false;
    let spellcheckBtn = null;
    const ALLOW_LIST = new Set(['ttg', 'website','nguyễn', 'vneid','internet', 'đăk', 'lăk', 'đắk','lắk']);
    const API_BASE = "http://192.168.1.98:2304/api/spellcheck";

    // Hàm lấy ID văn bản từ URL
    function getDocId() {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1];
    }

    // Hàm gọi API lấy danh sách lỗi
    function fetchApiErrors(id) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${API_BASE}/${id}`,
                onload: function(response) {
                    try { resolve(JSON.parse(response.responseText)); }
                    catch(e) { resolve([]); }
                },
                onerror: () => resolve([])
            });
        });
    }

    function shouldIgnoreWord(word) {
        if (word.length <= 1) return true;
        if (word.length > 1 && word === word.toUpperCase()) return true;
        if (/^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})$/i.test(word)) return true;
        if (ALLOW_LIST.has(word.toLowerCase())) return true;
        if (!/[aeiouyáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(word)) return true;
        return false;
    }

    function scrollToError(errorData) {
        const editorBody = document.querySelector('.preview-content');
        if (!editorBody) return;

        const errorText = typeof errorData === 'object' ? errorData.wrong : errorData;
        const errorType = typeof errorData === 'object' ? errorData.type : 'replace';
        const contextText = typeof errorData === 'object' ? errorData.context : null;

        const walker = document.createTreeWalker(editorBody, NodeFilter.SHOW_TEXT, null, false);
        let node;

        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const normalizeStr = (str) => str.normalize('NFC').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "").replace(/\s+/g, ' ').trim();

        // ---- TRƯỜNG HỢP 1: LỖI THIẾU TỪ (INSERT) VÀ DƯ TỪ (DELETE) ----
        if ((errorType === 'insert' || errorType === 'delete') && contextText) {
            let beforeText = "";
            let afterText = "";

            if (errorType === 'insert') {
                const parts = contextText.split(/\[THÊM:.*?\]/);
                beforeText = parts[0] || "";
                afterText = parts[1] || "";
            } else if (errorType === 'delete') {
                const parts = contextText.split(/\[XÓA:.*?\]/);
                beforeText = parts[0] || "";
                afterText = parts[1] || "";
            }

            const beforeWords = normalizeStr(beforeText).split(/\s+/).filter(w => w);
            const afterWords = normalizeStr(afterText).split(/\s+/).filter(w => w);

            let anchorText = "";
            let leftAnchor = beforeWords.slice(-3).join(" ");
            let rightAnchor = afterWords.slice(0, 3).join(" ");

            if (leftAnchor && rightAnchor) {
                anchorText = leftAnchor + " " + rightAnchor;
            } else {
                anchorText = leftAnchor || rightAnchor || beforeText.trim() || afterText.trim();
            }

            if (anchorText) {
                const regexString = anchorText.split(/\s+/).map(w => escapeRegExp(w)).join('\\s+');
                const anchorRegex = new RegExp(regexString, 'iu');

                while (node = walker.nextNode()) {
                    const match = node.textContent.match(anchorRegex);
                    if (match) {
                        try {
                            const range = document.createRange();
                            range.setStart(node, match.index);
                            range.setEnd(node, match.index + match[0].length);

                            const span = document.createElement('span');
                            range.surroundContents(span);
                            
                            span.scrollIntoView({ behavior: 'smooth', block: 'center' });

                            span.style.transition = 'background-color 0.3s ease';
                            span.style.backgroundColor = errorType === 'delete' ? '#ffccc7' : '#fffb8f';
                            span.style.borderRadius = '3px';

                            setTimeout(() => {
                                span.style.backgroundColor = 'transparent';
                                setTimeout(() => {
                                    const parent = span.parentNode;
                                    if (!parent) return;
                                    while (span.firstChild) parent.insertBefore(span.firstChild, span);
                                    parent.removeChild(span);
                                    parent.normalize();
                                }, 300);
                            }, 2000);
                            return; 
                        } catch(e) {
                            node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                    }
                }
            }
            console.log("Không thể đánh dấu chính xác do định dạng ẩn của web. Ngữ cảnh: ", contextText);
            return;
        }

        // ---- TRƯỜNG HỢP 2: LỖI SAI TỪ (REPLACE) ----
        if (errorType === 'replace') {
            const exactWordRegex = new RegExp(`(?<=^|[^\\p{L}])${escapeRegExp(errorText)}(?=[^\\p{L}]|$)`, 'iu');

            while (node = walker.nextNode()) {
                const match = node.textContent.match(exactWordRegex);
                if (match) {
                    if (contextText) {
                        let blockParent = node.parentElement;
                        while (blockParent && !['P', 'DIV', 'LI', 'TD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(blockParent.tagName) && blockParent !== editorBody) {
                            blockParent = blockParent.parentElement;
                        }

                        let parentText = blockParent ? blockParent.textContent : node.parentElement.textContent;
                        if (blockParent) {
                            if (blockParent.previousElementSibling) parentText = blockParent.previousElementSibling.textContent + " " + parentText;
                            if (blockParent.nextElementSibling) parentText = parentText + " " + blockParent.nextElementSibling.textContent;
                        }

                        let cleanContext = contextText
                            .replace(/\[THÊM:.*?\]/g, "")
                            .replace(/\[XÓA:.*?\]/g, errorText)
                            .replace(/\[SỬA:.*?(?:->|→).*?\]/gi, errorText)
                            .replace(/\n/g, ' ');

                        const normalizedParentText = normalizeStr(parentText);
                        cleanContext = normalizeStr(cleanContext);

                        if (!normalizedParentText.includes(cleanContext)) continue;
                    }

                    try {
                        const range = document.createRange();
                        const startIdx = match.index;
                        range.setStart(node, startIdx);
                        range.setEnd(node, startIdx + errorText.length);

                        const span = document.createElement('span');
                        range.surroundContents(span);
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        span.style.backgroundColor = 'yellow';
                        setTimeout(() => {
                            const parent = span.parentNode;
                            if (!parent) return;
                            while (span.firstChild) parent.insertBefore(span.firstChild, span);
                            parent.removeChild(span);
                            parent.normalize();
                        }, 2000);
                        break;
                    } catch (e) {
                        node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        break;
                    }
                }
            }
        }
    }

    async function initDictionary() {
        const cachedSyllables = GM_getValue('dict_syllables_v2');
        const cachedCompounds = GM_getValue('dict_compounds_v2');

        if (cachedSyllables && cachedCompounds) {
            validSyllables = new Set(JSON.parse(cachedSyllables));
            validCompounds = new Set(JSON.parse(cachedCompounds));
            return;
        }

        const fetchViet = new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://vietnamese-wordlist.duyet.net/Viet74K.txt",
                onload: function(response) {
                    if (response.status === 200) resolve(response.responseText);
                    else reject("Lỗi tải Viet74K");
                },
                onerror: reject
            });
        });

        const fetchEng = new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
                onload: function(response) {
                    if (response.status === 200) resolve(response.responseText);
                    else reject("Lỗi tải English Dictionary");
                },
                onerror: reject
            });
        });

        try {
            const [vietText, engText] = await Promise.all([fetchViet, fetchEng]);

            const tempSyllables = new Set();
            const tempCompounds = new Set();

            vietText.toLowerCase().split('\n').forEach(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return;
                if (cleanLine.includes(' ')) tempCompounds.add(cleanLine);
                else if (/^[\p{L}]+$/u.test(cleanLine)) tempSyllables.add(cleanLine);
                cleanLine.split(/\s+/).forEach(w => { if (/^[\p{L}]+$/u.test(w)) tempSyllables.add(w); });
            });

            engText.toLowerCase().split('\n').forEach(line => {
                const cleanLine = line.trim();
                if (cleanLine && /^[\p{L}]+$/u.test(cleanLine)) {
                    tempSyllables.add(cleanLine);
                }
            });

            GM_setValue('dict_syllables_v2', JSON.stringify(Array.from(tempSyllables)));
            GM_setValue('dict_compounds_v2', JSON.stringify(Array.from(tempCompounds)));

            validSyllables = tempSyllables;
            validCompounds = tempCompounds;
        } catch (error) {
            console.error("Lỗi khởi tạo từ điển:", error);
            alert("Không thể tải từ điển. Vui lòng kiểm tra kết nối mạng!");
        }
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        handle.onmousedown = dragMouseDown;
        handle.style.cursor = 'move';

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function createErrorPanel(errors) {
        let panel = document.getElementById('spellcheck-error-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'spellcheck-error-panel';
            panel.style.cssText = "position: fixed; top: 20px; left: 20px; width: 320px; max-height: 500px; background: white; border: 1px solid #d9d9d9; border-radius: 8px; z-index: 999999; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15); font-family: sans-serif; display: flex; flex-direction: column;";
            document.body.appendChild(panel);
        }
        panel.style.display = 'flex';
        const headerColor = errors.length > 0 ? "#e0282e" : "#28a745";

        panel.innerHTML = `
            <div id="spellcheck-header-handle" style="background: ${headerColor}; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <span>Phát hiện ${errors.length} lỗi chính tả</span>
                <button id="close-spell-panel" style="background:none; border:none; color:white; cursor:pointer; font-size: 18px;">×</button>
            </div>
            <div style="overflow-y: auto; padding: 10px; background: #fff; min-height: 50px;">
                <p style="font-size: 11px; color: #666; margin: 0 0 8px 0;">* Bấm vào item để cuộn đến vị trí lỗi</p>
                <ul id="error-list-ul" style="list-style: none; padding: 0; margin: 0;"></ul>
            </div>
        `;

        const headerHandle = panel.querySelector('#spellcheck-header-handle');
        makeDraggable(panel, headerHandle);

        const listUl = panel.querySelector('#error-list-ul');
        if (errors.length === 0) {
            listUl.innerHTML = `<li style="text-align:center; color: #888; padding: 10px;">Văn bản không có lỗi chính tả.</li>`;
        } else {
            errors.forEach(err => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #333; background: #fff1f0; margin-bottom: 6px; border-radius: 6px; cursor: pointer; transition: 0.2s; word-wrap: break-word;";

                if (typeof err === 'object') {
                    if (err.type === 'insert' || err.type === 'delete') {
                        let textBefore = "";
                        let textAfter = "";

                        if (err.type === 'insert') {
                            textBefore = err.context.replace(/\[THÊM:.*?\]/g, "").replace(/\s+/g, ' ').trim();
                            textAfter = err.context.replace(/\[THÊM:\s*(.*?)\]/g, "<strong>$1</strong>").replace(/\s+/g, ' ').trim();
                        } else if (err.type === 'delete') {
                            textBefore = err.context.replace(/\[XÓA:\s*(.*?)\]/g, "<strong style='text-decoration: line-through;'>$1</strong>").replace(/\s+/g, ' ').trim();
                            textAfter = err.context.replace(/\[XÓA:.*?\]/g, "").replace(/\s+/g, ' ').trim();
                        }

                        const typeLabel = err.type === 'insert' ? 'Thiếu từ' : 'Dư từ';
                        li.style.color = "#cf1322"; 
                        li.innerHTML = `<small style="display:block; color: #999; font-size: 10px; margin-bottom: 2px;">Gợi ý từ Database (${typeLabel})</small>
                                        <span>...${textBefore}...</span> → <span style="color: #28a745;">...${textAfter}...</span>`;
                    } else {
                        li.style.color = "#cf1322";
                        li.innerHTML = `<small style="display:block; color: #999; font-size: 10px; margin-bottom: 2px;">Gợi ý từ Database (Sai từ)</small>
                                        <span style="font-weight:bold;">${err.wrong}</span> → <span style="color: #28a745; font-weight: bold;">${err.fixed}</span>`;
                    }
                } else {
                    li.innerText = err;
                }

                li.onmouseover = () => { li.style.background = "#ffccc7"; };
                li.onmouseout = () => { li.style.background = "#fff1f0"; };

                li.onclick = () => scrollToError(err);

                listUl.appendChild(li);
            });
        }
        document.getElementById('close-spell-panel').onclick = () => { panel.style.display = 'none'; };
    }

    async function runCheckDirectly() {
        const editorBody = document.querySelector('.preview-content');
        if (!editorBody) return;

        let rawContent = editorBody.innerText || editorBody.textContent;
        let textContent = rawContent.normalize('NFC').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");

        if (!textContent.trim()) { createErrorPanel([]); return; }

        const docId = getDocId();
        const apiErrorsRaw = await fetchApiErrors(docId);
        const finalErrors = [];
        const seenInApi = new Set();

        apiErrorsRaw.forEach(err => {
            if (err.type === 'insert' || err.type === 'delete' || err.wrong === '[Bị thiếu từ]') {
                finalErrors.push(err);
                if (err.type === 'delete' && err.wrong) seenInApi.add(err.wrong.toLowerCase());
            } else {
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const exactWordRegex = new RegExp(`(?<=^|[^\\p{L}])${escapeRegExp(err.wrong)}(?=[^\\p{L}]|$)`, 'iu');

                if (exactWordRegex.test(textContent)) {
                    finalErrors.push(err);
                    seenInApi.add(err.wrong.toLowerCase());
                }
            }
        });

        const wrongWordsSet = new Set();
        const words = textContent.match(/[\p{L}]+/giu) || [];
        const wordStatus = new Array(words.length).fill(false);

        for (let i = 0; i < words.length - 1; i++) {
            const bigram = `${words[i].toLowerCase()} ${words[i+1].toLowerCase()}`;
            if (validCompounds.has(bigram)) { wordStatus[i] = true; wordStatus[i+1] = true; }
        }

        for (let i = 0; i < words.length; i++) {
            const originalWord = words[i];
            if (shouldIgnoreWord(originalWord)) continue;
            if (!wordStatus[i]) {
                const wLower = originalWord.toLowerCase();
                if (!validSyllables.has(wLower) && !seenInApi.has(wLower)) {
                    wrongWordsSet.add(originalWord);
                }
            }
        }

        wrongWordsSet.forEach(word => finalErrors.push(word));

        createErrorPanel(finalErrors);
    }

    function createFloatingButton() {
        if (spellcheckBtn) return;

        spellcheckBtn = document.createElement('button');
        spellcheckBtn.innerText = 'Đang tải...';

        spellcheckBtn.style.cssText = "position: fixed; bottom: 30px; left: 30px; z-index: 999999; background: #cccccc; color: white; border: none; padding: 12px 20px; border-radius: 50px; cursor: not-allowed; font-size: 14px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s; opacity: 0.7;";
        spellcheckBtn.disabled = true;

        spellcheckBtn.onclick = async () => {
            if (isChecking || spellcheckBtn.disabled) return;
            isChecking = true;
            spellcheckBtn.innerText = 'Đang quét...';
            spellcheckBtn.style.background = '#e0282e';

            if (validSyllables.size === 0) await initDictionary();
            await runCheckDirectly();

            spellcheckBtn.innerText = 'Quét lỗi';
            spellcheckBtn.style.background = '#28a745';
            isChecking = false;
        };
        document.body.appendChild(spellcheckBtn);

        waitForContent();
    }

    function waitForContent() {
        const checkInterval = setInterval(() => {
            const editorBody = document.querySelector('.preview-content');
            if (editorBody) {
                clearInterval(checkInterval);
                enableButton();
            }
        }, 1000);
    }

    function enableButton() {
        if (!spellcheckBtn) return;
        spellcheckBtn.innerText = 'Quét lỗi';
        spellcheckBtn.disabled = false;
        spellcheckBtn.style.background = '#28a745';
        spellcheckBtn.style.cursor = 'pointer';
        spellcheckBtn.style.opacity = '1';
    }

    setTimeout(createFloatingButton, 500);
})();