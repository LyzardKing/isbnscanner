async function getAllBooks() { return window.syncAPI.getAllBooks() }
async function saveBook(d) { return window.syncAPI.saveBook(d) }
async function deleteBook(i) { return window.syncAPI.deleteBook(i) }
async function clearAllBooks() { return window.syncAPI.clearAllBooks() }

const providers = [
    {
        name: 'Google Books',
        search: async function(isbn) {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
            if (!response.ok) {
                throw new Error(`Google Books error: ${response.status}`);
            }
            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                return null;
            }

            const book = data.items[0].volumeInfo;
            return {
                title: book.title,
                authors: book.authors || [],
                publisher: book.publisher,
                publishedDate: book.publishedDate,
                pageCount: book.pageCount,
                description: book.description,
                cover: book.imageLinks ? book.imageLinks.thumbnail : null
            };
        }
    },
    {
        name: 'Open Library',
        search: async function(isbn) {
            const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
            const data = await response.json();
            const bookKey = `ISBN:${isbn}`;

            if (!data[bookKey]) {
                return null;
            }

            const book = data[bookKey];
            let description = null;

            try {
                if (book.key) {
                    const editionRes = await fetch(`https://openlibrary.org${book.key}.json`);
                    const editionData = await editionRes.json();
                    const worksKey = editionData.works?.[0]?.key;
                    if (worksKey) {
                        const workRes = await fetch(`https://openlibrary.org${worksKey}.json`);
                        const workData = await workRes.json();
                        if (workData.description) {
                            description = typeof workData.description === 'string'
                                ? workData.description
                                : (workData.description.value || null);
                        }
                    }
                }
            } catch (e) {
                console.error('Open Library description fetch failed:', e);
            }

            return {
                title: book.title,
                authors: book.authors ? book.authors.map(a => a.name) : [],
                publisher: book.publishers ? book.publishers[0].name : null,
                publishedDate: book.publish_date,
                pageCount: book.number_of_pages,
                description,
                cover: book.cover ? book.cover.small : null
            };
        }
    }
];

let currentBook = null;
let currentSource = null;

async function lookupBook() {
    const isbn = document.getElementById('isbnInput').value.replace(/-/g, '');
    const resultDiv = document.getElementById('result');
    
    if (!isbn || (isbn.length !== 10 && isbn.length !== 13)) {
        resultDiv.innerHTML = '<div class="book-card"><p style="color: #f44336;">Please enter a valid 10 or 13 digit ISBN.</p></div>';
        return;
    }

    resultDiv.innerHTML = '<div class="loading">&#128269; Searching...</div>';
    currentBook = null;
    currentSource = null;

    for (const provider of providers) {
        try {
            const book = await provider.search(isbn);
            if (book) {
                currentBook = book;
                currentSource = provider.name;
                displayBook(book, provider.name);
                return;
            }
        } catch (error) {
            console.error(`${provider.name} error:`, error);
        }
    }

    resultDiv.innerHTML = '<div class="book-card"><p style="color: #ff9800;">&#128218; Book not found in any database.</p></div>';
}

function displayBook(book, source) {
    let html = '<div class="book-card">';
    html += `<span class="source-tag">Source: ${source}</span>`;
    html += '<h2>' + (book.title || 'Unknown Title') + '</h2>';
    
    if (book.authors && book.authors.length > 0) {
        html += '<p><strong>Author:</strong> ' + book.authors.join(', ') + '</p>';
    }
    if (book.publisher) {
        html += '<p><strong>Publisher:</strong> ' + book.publisher + '</p>';
    }
    if (book.publishedDate) {
        html += '<p><strong>Published:</strong> ' + book.publishedDate + '</p>';
    }
    if (book.pageCount) {
        html += '<p><strong>Pages:</strong> ' + book.pageCount + '</p>';
    }
    if (book.cover) {
        html += '<img src="' + book.cover + '" alt="Book cover">';
    }
    if (book.description) {
        const desc = book.description.length > 300 ? book.description.substring(0, 300) + '...' : book.description;
        html += '<p>' + desc + '</p>';
    }
    
    const isbn = document.getElementById('isbnInput').value.replace(/-/g, '');
    const exists = window.syncAPI && window.syncAPI.getBook(isbn);
    if (exists) {
        html += '<button disabled style="background:#4CAF50;opacity:0.6;">&#10004; Already in Collection</button>';
    } else {
        html += '<button onclick="saveToCollection()">&#10133; Add to Collection</button>';
    }
    html += '</div>';
    
    document.getElementById('result').innerHTML = html;
}

async function saveToCollection() {
    const isbn = document.getElementById('isbnInput').value.replace(/-/g, '');
    if (!currentBook || !isbn) return;

    const bookData = {
        isbn: isbn,
        title: currentBook.title,
        authors: currentBook.authors.join(', '),
        publisher: currentBook.publisher,
        publishedDate: currentBook.publishedDate,
        pageCount: currentBook.pageCount,
        description: currentBook.description,
        cover: currentBook.cover,
        source: currentSource,
        addedAt: new Date().toISOString()
    };

    try {
        await saveBook(bookData);
        showToast('Added to collection!', 'success');
        loadCollection();
    } catch (error) {
        console.error('Error saving book:', error);
        showToast('Failed to save book to collection', 'error');
    }
}

async function loadCollection() {
    const collectionDiv = document.getElementById('collection');

    try {
        const collection = await getAllBooks();
        const heading = document.querySelector('h2')
        heading.textContent = collection.length > 0
            ? `My Collection (${collection.length})`
            : 'My Collection'

        if (collection.length === 0) {
            collectionDiv.innerHTML = '<div class="empty-state">&#128218; No books in collection yet.<br>Search and add your first book!</div>';
            return;
        }

        // Sort by most recently added
        collection.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

        let html = '<div class="collection-grid">';
        collection.forEach((book) => {
            const coverImg = book.cover 
                ? `<img src="${book.cover}" alt="${book.title}">` 
                : '<div style="width:60px;height:80px;background:#e0e0e0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px;">&#128214;</div>';
            
            html += `<div class="collection-item" style="cursor: pointer;" onclick="openBookModal('${book.isbn}')">
                ${coverImg}
                <div class="collection-item-info">
                    <div class="collection-item-title">${book.title || 'Unknown Title'}</div>
                    <div class="collection-item-author">${book.authors || 'Unknown Author'}</div>
                </div>
                <button onclick="event.stopPropagation(); removeFromCollection('${book.isbn}')">&#128465;</button>
            </div>`;
        });
        html += '</div>';

        collectionDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading collection:', error);
        collectionDiv.innerHTML = '<div class="empty-state" style="color:#f44336;">Error loading collection.</div>';
    }
}

async function removeFromCollection(isbn) {
    if (!confirm('Remove this book from your collection?')) return;
    
    try {
        await deleteBook(isbn);
        loadCollection();
    } catch (error) {
        console.error('Error removing book:', error);
        showToast('Failed to remove book', 'error');
    }
}

async function exportCollection() {
    try {
        const collection = await getAllBooks();
        const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'book-collection.json';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting collection:', error);
        showToast('Failed to export collection', 'error');
    }
}

function importCollection() {
    document.getElementById('importFile').click();
}

async function handleImport(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format');

            const existing = window.syncAPI.getAllBooks();
            const existingISBNs = new Set(existing.map(b => b.isbn));
            const newBooks = imported.filter(b => !existingISBNs.has(b.isbn));
            
            if (newBooks.length > 0) {
                window.syncAPI.saveBooks(newBooks);
            }
            
            loadCollection();
            showToast(`Imported ${newBooks.length} new book(s)!`, 'success');
        } catch (err) {
            console.error('Import error:', err);
            showToast('Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

let _resyncCancelled = false;

async function resyncCollection() {
    const collection = window.syncAPI.getAllBooks();
    const missing = collection.filter(b => !b.description);

    if (missing.length === 0) {
        showToast('All books already have descriptions!', 'info');
        return;
    }

    _resyncCancelled = false;
    const btn = document.getElementById('resyncBtn');
    btn.innerHTML = '&#9209; Stop';
    btn.onclick = () => { _resyncCancelled = true; };

    const resultDiv = document.getElementById('result');
    let updated = 0;

    for (let i = 0; i < missing.length; i++) {
        if (_resyncCancelled) break;

        const book = missing[i];
        resultDiv.innerHTML = `<div class="loading">&#128260; Resyncing ${i + 1}/${missing.length}: ${book.title || book.isbn}...</div>`;

        for (const provider of providers) {
            try {
                const data = await provider.search(book.isbn);
                if (data) {
                    const updates = {};
                    if (data.description) updates.description = data.description;
                    if (Object.keys(updates).length > 0) {
                        window.syncAPI.saveBook({ ...book, ...updates });
                        updated++;
                    }
                    break;
                }
            } catch (e) {
                console.error(`${provider.name} error for ${book.isbn}:`, e);
            }
        }

        if (i < missing.length - 1 && !_resyncCancelled) {
            await new Promise(r => setTimeout(r, 600));
        }
    }

    btn.innerHTML = '&#128260; Resync';
    btn.onclick = resyncCollection;
    loadCollection();

    resultDiv.innerHTML = _resyncCancelled
        ? `<div class="loading">&#9209; Resync stopped. Updated ${updated} book(s).</div>`
        : `<div class="loading">&#9989; Resync complete. Updated ${updated} book(s).</div>`;

    setTimeout(() => { resultDiv.innerHTML = ''; }, 4000);
}

// Modal functions
let currentModalISBN = null;

async function openBookModal(isbn) {
    try {
        const book = window.syncAPI.getBook(isbn)
        if (!book) return

        currentModalISBN = isbn

        document.getElementById('modalTitle').textContent = book.title || 'Unknown Title'

        const coverDiv = document.getElementById('modalCover')
        if (book.cover) {
            coverDiv.innerHTML = `<img src="${book.cover}" alt="${book.title}">`
        } else {
            coverDiv.innerHTML = '<div style="font-size: 80px;">&#128214;</div>'
        }

        const infoDiv = document.getElementById('modalInfo')
        let infoHtml = ''

        if (book.authors) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Author:</div>
                <div class="modal-info-value">${book.authors}</div>
            </div>`
        }

        if (book.isbn) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">ISBN:</div>
                <div class="modal-info-value">${book.isbn}</div>
            </div>`
        }

        if (book.publisher) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Publisher:</div>
                <div class="modal-info-value">${book.publisher}</div>
            </div>`
        }

        if (book.publishedDate) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Published:</div>
                <div class="modal-info-value">${book.publishedDate}</div>
            </div>`
        }

        if (book.pageCount) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Pages:</div>
                <div class="modal-info-value">${book.pageCount}</div>
            </div>`
        }

        if (book.source) {
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Source:</div>
                <div class="modal-info-value">${book.source}</div>
            </div>`
        }

        if (book.addedAt) {
            const date = new Date(book.addedAt).toLocaleDateString()
            infoHtml += `<div class="modal-info-item">
                <div class="modal-info-label">Added:</div>
                <div class="modal-info-value">${date}</div>
            </div>`
        }

        infoDiv.innerHTML = infoHtml

        const descDiv = document.getElementById('modalDescription')
        if (book.description) {
            descDiv.style.display = 'block'
            descDiv.innerHTML = `<strong>Description:</strong><br>${book.description}`
        } else {
            descDiv.style.display = 'none'
        }

        document.getElementById('bookModal').classList.add('active')
        document.body.style.overflow = 'hidden'
    } catch (error) {
        console.error('Error opening modal:', error)
    }
}

function closeModal() {
    document.getElementById('bookModal').classList.remove('active');
    document.body.style.overflow = '';
    currentModalISBN = null;
}

function closeModalOnBackdrop(event) {
    if (event.target.id === 'bookModal') {
        closeModal();
    }
}

async function deleteFromModal() {
    if (!currentModalISBN) return;
    
    if (!confirm('Remove this book from your collection?')) return;
    
    try {
        await deleteBook(currentModalISBN);
        closeModal();
        loadCollection();
    } catch (error) {
        console.error('Error removing book:', error);
        showToast('Failed to remove book', 'error');
    }
}

async function resyncBook(isbn) {
    const book = window.syncAPI.getBook(isbn);
    if (!book) return;

    if (book.description) {
        showToast('This book already has a description!', 'info');
        return;
    }

    for (const provider of providers) {
        try {
            const data = await provider.search(book.isbn);
            if (data && data.description) {
                window.syncAPI.saveBook({ ...book, description: data.description });
                showToast('Description updated!', 'success');
                openBookModal(isbn);
                loadCollection();
                return;
            }
        } catch (e) {
            console.error(`${provider.name} error for ${book.isbn}:`, e);
        }
    }

    showToast('No description found for this book.', 'error');
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        const sm = document.getElementById('scannerModal');
        if (sm && sm.classList.contains('active')) stopScanner();
    }
});