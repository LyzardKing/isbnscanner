// IndexedDB setup
const DB_NAME = 'ISBNScannerDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

let db = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'isbn' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('addedAt', 'addedAt', { unique: false });
            }
        };
    });
}

function getAllBooks() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

function saveBook(bookData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(bookData);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function deleteBook(isbn) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(isbn);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function clearAllBooks() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

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
            return {
                title: book.title,
                authors: book.authors ? book.authors.map(a => a.name) : [],
                publisher: book.publishers ? book.publishers[0].name : null,
                publishedDate: book.publish_date,
                pageCount: book.number_of_pages,
                description: null,
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

    resultDiv.innerHTML = '<div class="loading">🔍 Searching...</div>';
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

    resultDiv.innerHTML = '<div class="book-card"><p style="color: #ff9800;">📚 Book not found in any database.</p></div>';
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
    
    html += '<button onclick="saveToCollection()">➕ Add to Collection</button>';
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
        alert('Added to collection!');
        loadCollection();
    } catch (error) {
        console.error('Error saving book:', error);
        alert('Failed to save book to collection');
    }
}

async function loadCollection() {
    const collectionDiv = document.getElementById('collection');

    try {
        const collection = await getAllBooks();
        
        if (collection.length === 0) {
            collectionDiv.innerHTML = '<div class="empty-state">📚 No books in collection yet.<br>Search and add your first book!</div>';
            return;
        }

        // Sort by most recently added
        collection.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

        let html = '<div class="collection-grid">';
        collection.forEach((book) => {
            const coverImg = book.cover 
                ? `<img src="${book.cover}" alt="${book.title}">` 
                : '<div style="width:60px;height:80px;background:#e0e0e0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px;">📖</div>';
            
            html += `<div class="collection-item" style="cursor: pointer;" onclick="openBookModal('${book.isbn}')">
                ${coverImg}
                <div class="collection-item-info">
                    <div class="collection-item-title">${book.title || 'Unknown Title'}</div>
                    <div class="collection-item-author">${book.authors || 'Unknown Author'}</div>
                </div>
                <button onclick="event.stopPropagation(); removeFromCollection('${book.isbn}')">🗑️</button>
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
        alert('Failed to remove book');
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
        alert('Failed to export collection');
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

            const existing = await getAllBooks();
            const existingISBNs = new Set(existing.map(b => b.isbn));
            
            let importedCount = 0;
            for (const book of imported) {
                if (!existingISBNs.has(book.isbn)) {
                    await saveBook(book);
                    importedCount++;
                }
            }
            
            loadCollection();
            alert(`Imported ${importedCount} new book(s)!`);
        } catch (err) {
            console.error('Import error:', err);
            alert('Invalid file format');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// Modal functions
let currentModalISBN = null;

async function openBookModal(isbn) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(isbn);
        
        request.onsuccess = () => {
            const book = request.result;
            if (!book) return;
            
            currentModalISBN = isbn;
            
            // Set title
            document.getElementById('modalTitle').textContent = book.title || 'Unknown Title';
            
            // Set cover
            const coverDiv = document.getElementById('modalCover');
            if (book.cover) {
                coverDiv.innerHTML = `<img src="${book.cover}" alt="${book.title}">`;
            } else {
                coverDiv.innerHTML = '<div style="font-size: 80px;">📖</div>';
            }
            
            // Set info
            const infoDiv = document.getElementById('modalInfo');
            let infoHtml = '';
            
            if (book.authors) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Author:</div>
                    <div class="modal-info-value">${book.authors}</div>
                </div>`;
            }
            
            if (book.isbn) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">ISBN:</div>
                    <div class="modal-info-value">${book.isbn}</div>
                </div>`;
            }
            
            if (book.publisher) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Publisher:</div>
                    <div class="modal-info-value">${book.publisher}</div>
                </div>`;
            }
            
            if (book.publishedDate) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Published:</div>
                    <div class="modal-info-value">${book.publishedDate}</div>
                </div>`;
            }
            
            if (book.pageCount) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Pages:</div>
                    <div class="modal-info-value">${book.pageCount}</div>
                </div>`;
            }
            
            if (book.source) {
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Source:</div>
                    <div class="modal-info-value">${book.source}</div>
                </div>`;
            }
            
            if (book.addedAt) {
                const date = new Date(book.addedAt).toLocaleDateString();
                infoHtml += `<div class="modal-info-item">
                    <div class="modal-info-label">Added:</div>
                    <div class="modal-info-value">${date}</div>
                </div>`;
            }
            
            infoDiv.innerHTML = infoHtml;
            
            // Set description
            const descDiv = document.getElementById('modalDescription');
            if (book.description) {
                descDiv.style.display = 'block';
                descDiv.innerHTML = `<strong>Description:</strong><br>${book.description}`;
            } else {
                descDiv.style.display = 'none';
            }
            
            // Show modal
            document.getElementById('bookModal').classList.add('active');
            document.body.style.overflow = 'hidden';
        };
    } catch (error) {
        console.error('Error opening modal:', error);
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
        alert('Failed to remove book');
    }
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});