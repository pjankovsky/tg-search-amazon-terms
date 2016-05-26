(function () {
    "use strict";
    let Sequelize = require('sequelize');
    let Product, ProductImage, ProductPrices, ProductCategory;
    let CATEGORY_SEPARATOR = ' > ';

    let flattenCategory = function (root) {
        var name = root.Name;
        if (typeof root.Ancestors == 'undefined')
            return name;
        if (typeof root.Ancestors.BrowseNode.Name == 'undefined')
            return name;
        return flattenCategory(root.Ancestors.BrowseNode) + CATEGORY_SEPARATOR + name;
    };

    let _init = function () {
        return require('tg-node-lib/lib/config').getAllConfig().then((config) => {
            let db = new Sequelize(config['db.catalog.database'], config['db.catalog.user'], config['db.catalog.password'], {
                host: config['db.catalog.host'],
                dialect: 'mysql',
                // logging: null,
                pool: {
                    maxConnections: 50,
                    minConnections: 0,
                    maxIdleTime: 10000
                }
            });

            Product = db.define('product', {
                id: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                asin: {
                    type: Sequelize.STRING(10),
                    allowNull: false,
                    unique: true
                },
                title: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                affiliateLink: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                salesRank: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true
                },
                brand: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                ean: {
                    type: Sequelize.STRING(13),
                    allowNull: true
                },
                mpn: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                description: {
                    type: Sequelize.TEXT('medium'),
                    allowNull: false
                },
                features: {
                    type: Sequelize.TEXT('medium'),
                    allowNull: false
                },
                color: {
                    type: Sequelize.STRING,
                    allowNull: true
                },
                size: {
                    type: Sequelize.STRING,
                    allowNull: true
                },
                warranty: {
                    type: Sequelize.STRING,
                    allowNull: true
                },
                boxWidth: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    default: 1000,
                    comment: 'hundredths-inches'
                },
                boxLength: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    default: 1000,
                    comment: 'hundredths-inches'
                },
                boxHeight: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    default: 1000,
                    comment: 'hundredths-inches'
                },
                boxWeight: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    default: 1000,
                    comment: 'hundredths-pounds'
                },
                productGroup: {
                    type: Sequelize.STRING,
                    allowNull: true
                },
                productType: {
                    type: Sequelize.STRING,
                    allowNull: true
                }
            }, {
                instanceMethods: {
                    importAmazonItem: (product, item) => {
                        // tmp item storage
                        product.amzItem = item;
                        // asin is already set
                        product.title = item.ItemAttributes.Title;
                        product.affiliateLink = item.DetailPageURL;

                        if (typeof item.SalesRank == 'undefined')
                            product.salesRank = null;
                        else
                            product.salesRank = parseInt(item.SalesRank);

                        product.brand = item.ItemAttributes.Brand
                            || item.ItemAttributes.Manufacturer
                            || item.ItemAttributes.Label
                            || item.ItemAttributes.Publisher
                            || item.ItemAttributes.Studio
                            || null;

                        product.ean = item.ItemAttributes.EAN
                            || item.ItemAttributes.UPC
                            || null;

                        product.mpn = item.ItemAttributes.MPN
                            || item.ItemAttributes.PartNumber
                            || item.ItemAttributes.ItemPartNumber
                            || item.ItemAttributes.Model
                            || null;

                        if (typeof item.EditorialReviews != 'undefined') {
                            if (Object.prototype.toString.call(item.EditorialReviews.EditorialReview) == '[object Array]') {
                                for (var i = 0; i < item.EditorialReviews.EditorialReview.length; i++) {
                                    if (item.EditorialReviews.EditorialReview[i].Source == 'Product Description')
                                        product.description = item.EditorialReviews.EditorialReview[i].Content;
                                }
                            } else if (typeof item.EditorialReviews == 'object') {
                                if (item.EditorialReviews.EditorialReview.Source == 'Product Description')
                                    product.description = item.EditorialReviews.EditorialReview.Content;
                            }
                        }

                        product.features = item.ItemAttributes.Feature || [];
                        if (Object.prototype.toString.call(product.features) == '[object Array]')
                            product.features = product.features.join("\n");
                        else
                            product.features = String(product.features);

                        product.color = item.ItemAttributes.Color || null;
                        product.size = item.ItemAttributes.Size || null;
                        product.warranty = item.ItemAttributes.Warranty || null;

                        var dimensions = null;
                        if (typeof item.ItemAttributes.PackageDimensions !== 'undefined')
                            dimensions = item.ItemAttributes.PackageDimensions;
                        else if (typeof item.ItemAttributes.ItemDimensions !== 'undefined')
                            dimensions = item.ItemAttributes.ItemDimensions;

                        if (dimensions !== null) {
                            product.boxWidth = dimensions.Width['_'] || null;
                            product.boxLength = dimensions['Length']['_'] || null;
                            product.boxHeight = dimensions.Height['_'] || null;
                            product.boxWeight = dimensions.Weight['_'] || null;
                        }

                        product.productGroup = item.ItemAttributes.ProductGroup || null;
                        product.productType = item.ItemAttributes.ProductTypeName || null;

                        return product.save()
                        // images
                            .then((product) => {
                                if (typeof item.ImageSets == 'undefined')
                                    return product; // no images, move on

                                var _images = [];
                                if (Object.prototype.toString.call(item.ImageSets.ImageSet) == '[object Array]') {
                                    _images = item.ImageSets.ImageSet;
                                } else if (typeof item.ImageSets.ImageSet == 'object') {
                                    _images = [item.ImageSets.ImageSet];
                                }
                                var primary = '';
                                var variants = [];
                                for (var i = 0; i < _images.length; i++) {
                                    if (_images[i].$.Category == 'primary')
                                        primary = _images[i].LargeImage.URL;
                                    else if (_images[i].$.Category == 'variant')
                                        variants.push(_images[i].LargeImage.URL);
                                }
                                variants.unshift(primary);
                                product.newImages = variants;
                                // load up the old images
                                return product.getImages();
                            })
                            .then((images) => {
                                // console.log(product.newImages);
                                var i, j;
                                // first figure out which images to delete
                                // also create an object with the images indexed by amzUrl
                                var byAmzUrl = {};
                                var changes = [];
                                for (i = 0; i < images.length; i++) {
                                    var img = images[i];
                                    var found = false;
                                    for (j = 0; j < product.newImages.length; j++) {
                                        if (img.amazonUrl == product.newImages[j]) {
                                            found = true;
                                            byAmzUrl[img.amazonUrl] = img;
                                            break;
                                        }
                                    }
                                    // add destroy promises to the change array
                                    if (found == false)
                                        changes.push(img.destroy());
                                }

                                // iterate the new images and either update the existing entry or make a new one
                                for (i = 0; i < product.newImages.length; i++) {
                                    var url = product.newImages[i];
                                    if (typeof byAmzUrl[url] == 'undefined') {
                                        changes.push(ProductImage.create({
                                            index: i,
                                            url: '',
                                            amazonUrl: url,
                                            needsUpdate: 1,
                                            productId: product.id
                                        }))
                                    } else {
                                        byAmzUrl[url].index = i;
                                        changes.push(byAmzUrl[url].save());
                                    }
                                }

                                // commit all the changes
                                return Promise.all(changes);
                            })
                            .then(() => {
                                // all done with images, move on to prices
                                return product.getPrices();
                            })
                            // prices
                            .then((prices) => {
                                if (prices === null)
                                    prices = ProductPrices.build({
                                        cost: 0,
                                        price: 0,
                                        productId: product.id
                                    })
                                if (typeof product.amzItem.ItemAttributes.ListPrice != 'undefined') {
                                    prices.msrp = product.amzItem.ItemAttributes.ListPrice.Amount;
                                }
                                return prices.save();
                            })
                            // cateogries
                            .then(() => {
                                // all done with prices, move on to categories
                                // build up new category array
                                var roots = [];
                                if (Object.prototype.toString.call(product.amzItem.BrowseNodes.BrowseNode) == '[object Array]') {
                                    roots = product.amzItem.BrowseNodes.BrowseNode;
                                } else {
                                    roots = [product.amzItem.BrowseNodes.BrowseNode];
                                }

                                var primaries = [];
                                var alternates = [];
                                for (var i = 0; i < roots.length; i++) {
                                    var flatCat = flattenCategory(roots[i]);
                                    primaries.push(flatCat);
                                    if (typeof roots[i].Children != 'undefined') {
                                        for (var j = 0; j < roots[i].Children.BrowseNode.length; j++) {
                                            alternates.push(flatCat + CATEGORY_SEPARATOR + roots[i].Children.BrowseNode[j].Name);
                                        }
                                    }
                                }

                                product.catPrimaries = primaries;
                                product.catAlternates = alternates;

                                return product.getCategories();
                            })

                            .then((categories) => {
                                // delete all of the old categories
                                var changes = categories.map((cat) => {
                                    return cat.destroy();
                                })
                                // add the new cats
                                var i;
                                for (i = 0; i < product.catPrimaries.length; i++) {
                                    changes.push(ProductCategory.create({
                                        isPrimary: 1,
                                        amazonCategory: product.catPrimaries[i],
                                        productId: product.id
                                    }));
                                }
                                for (i = 0; i < product.catAlternates.length; i++) {
                                    changes.push(ProductCategory.create({
                                        isPrimary: 0,
                                        amazonCategory: product.catAlternates[i],
                                        productId: product.id
                                    }));
                                }
                                return Promise.all(changes);
                            })
                            .then(() => {
                                return product;
                            })
                            .catch((err) => {
                                console.log(err);
                                return false;
                            });
                    }
                }
            });

            ProductImage = db.define('product_image', {
                id: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                index: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false
                },
                url: {
                    type: Sequelize.TEXT,
                    allowNull: false
                },
                amazonUrl: {
                    type: Sequelize.TEXT,
                    allowNull: false
                },
                needsUpdate: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    default: 1
                },
            }, {});

            Product.hasMany(ProductImage, {as: 'Images'});

            ProductPrices = db.define('product_price', {
                id: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                msrp: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: true,
                    comment: 'hundredths-dollars'
                },
                cost: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    comment: 'hundredths-dollars'
                },
                price: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: false,
                    comment: 'hundredths-dollars'
                }
            }, {});

            Product.hasOne(ProductPrices, {as: 'Prices'});

            ProductCategory = db.define('product_category', {
                id: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                isPrimary: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    default: 0
                },
                amazonCategory: {
                    type: Sequelize.TEXT,
                    allowNull: false
                }
            }, {});

            Product.hasMany(ProductCategory, {as: 'Categories'});
        });
    }


    module.exports = {
        setup: () => {
            // always return a promise
            console.log('- Startup DB');
            return _init()
                .then(() => Product.sync())
                .then(() => {
                    return Promise.all([
                        ProductImage.sync(),
                        ProductCategory.sync(),
                        ProductPrices.sync()
                    ]);
                });
        },
        Product: () => {
            return Product;
        },
        ProductImage: () => {
            return ProductImage;
        },
        ProductCategory: () => {
            return ProductCategory;
        },
        ProductPrices: () => {
            return ProductPrices;
        },
        importAmazonItem: (item) => {
            // console.log(JSON.stringify(item));
            // always return a promise
            return Product.count({where: {asin: item.ASIN}})
                .then((count) => {
                    if (count == 1) {
                        // update product
                        return Product.findOne({where: {asin: item.ASIN}});
                    } else {
                        // create product
                        return new Promise((resolve) => resolve(Product.build({asin: item.ASIN})));
                    }
                })
                .then((product) => {
                    if (product === null) // findOne returns null for no rows
                        return false; // break
                    return product.importAmazonItem(product, item);
                });
        }
    };
}).call(this);
