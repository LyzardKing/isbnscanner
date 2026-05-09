const providers = [
    {
        name: 'Google Books',
        search: async function(isbn) {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
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
        resultDiv.innerHTML = '<p>Please enter a valid 10 or 13 digit ISBN.</p>';
        return;
    }

    resultDiv.innerHTML = '<p>Searching...</p>';
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

    resultDiv.innerHTML = '<p>Book not found in any database.</p>';
}

function displayBook(book, source) {
    let html = `<p><em>Source: ${source}</em></p>`;
    html += '<h2>' + (book.title || 'Unknown Title') + '</h2>';
    
    if (book.authors && book.authors.length > 0) {
        html += '<p><strong>Author(s):</strong> ' + book.authors.join(', ') + '</p>';
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
    if (book.description) {
        html += '<p><strong>Description:</strong> ' + book.description.substring(0, 300) + '...</p>';
    }
    if (book.cover) {
        html += '<img src="' + book.cover + '" alt="Cover">';
    }
    
    html += '<br><button onclick="saveToCollection()">Add to Collection</button>';
    
    document.getElementById('result').innerHTML = html;
}

function saveToCollection() {
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
    
    const collection = JSON.parse(localStorage.getItem('bookCollection') || '[]');
    
    const existingIndex = collection.findIndex(b => b.isbn === isbn);
    if (existingIndex >= 0) {
        collection[existingIndex] = bookData;
    } else {
        collection.push(bookData);
    }
    
    localStorage.setItem('bookCollection', JSON.stringify(collection));
    alert('Added to collection!');
    loadCollection();
}

function loadCollection() {
    const collectionDiv = document.getElementById('collection');
    const collection = JSON.parse(localStorage.getItem('bookCollection') || '[]');
    
    if (collection.length === 0) {
        collectionDiv.innerHTML = '<p>No books in collection.</p>';
        return;
    }
    
    let html = '<table border="1" cellpadding="5"><tr><th>Title</th><th>Author</th><th>ISBN</th><th>Source</th><th></th></tr>';
    collection.forEach((book, index) => {
        let coverHtml = book.cover ? `<img src="${book.cover}" height="50">` : '';
        html += `<tr>
            <td>${book.title || ''}</td>
            <td>${book.authors || ''}</td>
            <td>${book.isbn}</td>
            <td>${book.source}</td>
            <td>${coverHtml} <button onclick="removeFromCollection(${index})">Delete</button></td>
        </tr>`;
    });
    html += '</table>';
    
    collectionDiv.innerHTML = html;
}

function removeFromCollection(index) {
    const collection = JSON.parse(localStorage.getItem('bookCollection') || '[]');
    collection.splice(index, 1);
    localStorage.setItem('bookCollection', JSON.stringify(collection));
    loadCollection();
}

function exportCollection() {
    const collection = JSON.parse(localStorage.getItem('bookCollection') || '[]');
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'book-collection.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importCollection() {
    document.getElementById('importFile').click();
}

function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format');
            
            const collection = JSON.parse(localStorage.getItem('bookCollection') || '[]');
            imported.forEach(book => {
                if (!collection.find(b => b.isbn === book.isbn)) {
                    collection.push(book);
                }
            });
            
            localStorage.setItem('bookCollection', JSON.stringify(collection));
            loadCollection();
            alert('Collection imported!');
        } catch (err) {
            alert('Invalid file format');
        }
    };
    reader.readAsText(file);
    input.value = '';
}