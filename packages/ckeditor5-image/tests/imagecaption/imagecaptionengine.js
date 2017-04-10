/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import VirtualTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor';
import ViewAttributeElement from '@ckeditor/ckeditor5-engine/src/view/attributeelement';
import ViewPosition from '@ckeditor/ckeditor5-engine/src/view/position';
import viewWriter from '@ckeditor/ckeditor5-engine/src/view/writer';
import ModelElement from '@ckeditor/ckeditor5-engine/src/model/element';
import ModelRange from '@ckeditor/ckeditor5-engine/src/model/range';
import ModelPosition from '@ckeditor/ckeditor5-engine/src/model/position';
import ImageCaptionEngine from '../../src/imagecaption/imagecaptionengine';
import ImageEngine from '../../src/image/imageengine';
import UndoEngine from '@ckeditor/ckeditor5-undo/src/undoengine';
import { getData as getModelData, setData as setModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import { getData as getViewData } from '@ckeditor/ckeditor5-engine/src/dev-utils/view';
import buildViewConverter from '@ckeditor/ckeditor5-engine/src/conversion/buildviewconverter';
import buildModelConverter from '@ckeditor/ckeditor5-engine/src/conversion/buildmodelconverter';

describe( 'ImageCaptionEngine', () => {
	let editor, document, viewDocument;

	beforeEach( () => {
		return VirtualTestEditor.create( {
			plugins: [ ImageCaptionEngine, ImageEngine, UndoEngine ]
		} )
			.then( newEditor => {
				editor = newEditor;
				document = editor.document;
				viewDocument = editor.editing.view;
				document.schema.registerItem( 'widget' );
				document.schema.allow( { name: 'widget', inside: '$root' } );
				document.schema.allow( { name: 'caption', inside: 'widget' } );
				document.schema.allow( { name: '$inline', inside: 'widget' } );

				buildViewConverter().for( editor.data.viewToModel ).fromElement( 'widget' ).toElement( 'widget' );
				buildModelConverter().for( editor.data.modelToView, editor.editing.modelToView ).fromElement( 'widget' ).toElement( 'widget' );
			} );
	} );

	it( 'should be loaded', () => {
		expect( editor.plugins.get( ImageCaptionEngine ) ).to.be.instanceOf( ImageCaptionEngine );
	} );

	it( 'should set proper schema rules', () => {
		expect( document.schema.check( { name: 'caption', iniside: 'image' } ) ).to.be.true;
		expect( document.schema.check( { name: '$inline', inside: 'caption' } ) ).to.be.true;
		expect( document.schema.itemExtends( 'caption', '$block' ) ).to.be.true;
		expect( document.schema.limits.has( 'caption' ) );
	} );

	describe( 'data pipeline', () => {
		describe( 'view to model', () => {
			it( 'should convert figcaption inside image figure', () => {
				editor.setData( '<figure class="image"><img src="foo.png"/><figcaption>foo bar</figcaption></figure>' );

				expect( getModelData( document, { withoutSelection: true } ) )
					.to.equal( '<image src="foo.png"><caption>foo bar</caption></image>' );
			} );

			it( 'should add empty caption if there is no figcaption', () => {
				editor.setData( '<figure class="image"><img src="foo.png"/></figure>' );

				expect( getModelData( document, { withoutSelection: true } ) )
					.to.equal( '<image src="foo.png"><caption></caption></image>' );
			} );

			it( 'should not convert figcaption inside other elements than image', () => {
				editor.setData( '<widget><figcaption>foobar</figcaption></widget>' );

				expect( getModelData( document, { withoutSelection: true } ) )
					.to.equal( '<widget>foobar</widget>' );
			} );
		} );

		describe( 'model to view', () => {
			it( 'should convert caption element to figcaption', () => {
				setModelData( document, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( editor.getData() ).to.equal( '<figure class="image"><img src="img.png"><figcaption>Foo bar baz.</figcaption></figure>' );
			} );

			it( 'should not convert caption to figcaption if it\'s empty', () => {
				setModelData( document, '<image src="img.png"><caption></caption></image>' );

				expect( editor.getData() ).to.equal( '<figure class="image"><img src="img.png"></figure>' );
			} );

			it( 'should not convert caption from other elements', () => {
				setModelData( document, '<widget>foo bar<caption></caption></widget>' );
				expect( editor.getData() ).to.equal( '<widget>foo bar</widget>' );
			} );
		} );
	} );

	describe( 'editing pipeline', () => {
		describe( 'model to view', () => {
			it( 'should convert caption element to figcaption contenteditable', () => {
				setModelData( document, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( getViewData( viewDocument, { withoutSelection: true } ) ).to.equal(
					'<figure class="image ck-widget" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'Foo bar baz.' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should convert caption to element with proper CSS class if it\'s empty', () => {
				setModelData( document, '<image src="img.png"><caption></caption></image>' );

				expect( getViewData( viewDocument, { withoutSelection: true } ) ).to.equal(
					'<figure class="image ck-widget" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-placeholder ck-editable ck-hidden" contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should not convert caption from other elements', () => {
				setModelData( document, '<widget>foo bar<caption></caption></widget>' );
				expect( getViewData( viewDocument, { withoutSelection: true } ) ).to.equal( '<widget>foo bar</widget>' );
			} );

			it( 'should not convert when element is already consumed', () => {
				editor.editing.modelToView.on(
					'insert:caption',
					( evt, data, consumable, conversionApi ) => {
						consumable.consume( data.item, 'insert' );

						const imageFigure = conversionApi.mapper.toViewElement( data.range.start.parent );
						const viewElement = new ViewAttributeElement( 'span' );

						const viewPosition = ViewPosition.createAt( imageFigure, 'end' );
						conversionApi.mapper.bindElements( data.item, viewElement );
						viewWriter.insert( viewPosition, viewElement );
					},
					{ priority: 'high' }
				);

				setModelData( document, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( getViewData( viewDocument, { withoutSelection: true } ) ).to.equal(
					'<figure class="image ck-widget" contenteditable="false"><img src="img.png"></img><span></span>Foo bar baz.</figure>'
				);
			} );

			it( 'should show caption when something is inserted inside', () => {
				setModelData( document, '<image src="img.png"><caption></caption></image>' );
				const image = document.getRoot().getChild( 0 );
				const caption = image.getChild( 0 );

				document.enqueueChanges( () => {
					const batch = document.batch();
					batch.insert( ModelPosition.createAt( caption ), 'foo bar' );
				} );

				expect( getViewData( viewDocument ) ).to.equal(
					'[]<figure class="image ck-widget" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'foo bar' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should hide when everything is removed from caption', () => {
				setModelData( document, '<image src="img.png"><caption>foo bar baz</caption></image>' );
				const image = document.getRoot().getChild( 0 );
				const caption = image.getChild( 0 );

				document.enqueueChanges( () => {
					const batch = document.batch();
					batch.remove( ModelRange.createIn( caption ) );
				} );

				expect( getViewData( viewDocument ) ).to.equal(
					'[]<figure class="image ck-widget" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable ck-hidden ck-placeholder" contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should show when not everything is removed from caption', () => {
				setModelData( document, '<image src="img.png"><caption>foo bar baz</caption></image>' );
				const image = document.getRoot().getChild( 0 );
				const caption = image.getChild( 0 );

				document.enqueueChanges( () => {
					const batch = document.batch();
					batch.remove( ModelRange.createFromParentsAndOffsets( caption, 0, caption, 8 ) );
				} );

				expect( getViewData( viewDocument ) ).to.equal(
					'[]<figure class="image ck-widget" contenteditable="false">' +
					'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">baz</figcaption>' +
					'</figure>'
				);
			} );
		} );
	} );

	describe( 'inserting image to document', () => {
		it( 'should add caption element if image does not have it', () => {
			const image = new ModelElement( 'image', { src: '', alt: '' } );
			const batch = document.batch();

			document.enqueueChanges( () => {
				batch.insert( new ModelPosition( document.getRoot(), [ 0 ] ), image );
			} );

			expect( getModelData( document ) ).to.equal(
				'[]<image alt="" src=""><caption></caption></image>'
			);

			expect( getViewData( viewDocument ) ).to.equal(
				'[]<figure class="image ck-widget" contenteditable="false">' +
					'<img alt="" src=""></img>' +
					'<figcaption class="ck-placeholder ck-editable ck-hidden" contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not add caption element if image already have it', () => {
			const caption = new ModelElement( 'caption', null, 'foo bar' );
			const image = new ModelElement( 'image', { src: '', alt: '' }, caption );
			const batch = document.batch();

			document.enqueueChanges( () => {
				batch.insert( new ModelPosition( document.getRoot(), [ 0 ] ), image );
			} );

			expect( getModelData( document ) ).to.equal(
				'[]<image alt="" src=""><caption>foo bar</caption></image>'
			);

			expect( getViewData( viewDocument ) ).to.equal(
				'[]<figure class="image ck-widget" contenteditable="false">' +
					'<img alt="" src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
						'foo bar' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not add caption element twice', () => {
			const image = new ModelElement( 'image', { src: '', alt: '' } );
			const caption = new ModelElement( 'caption' );
			const batch = document.batch();

			document.enqueueChanges( () => {
				batch
					// Since we are adding an empty image, this should trigger caption fixer.
					.insert( ModelPosition.createAt( document.getRoot() ), image )
					// Add caption just after the image is inserted, in same batch and enqueue changes block.
					.insert( ModelPosition.createAt( image ), caption );
			} );

			// Check whether caption fixer added redundant caption.
			expect( getModelData( document ) ).to.equal(
				'[]<image alt="" src=""><caption></caption></image>'
			);

			expect( getViewData( viewDocument ) ).to.equal(
				'[]<figure class="image ck-widget" contenteditable="false">' +
				'<img alt="" src=""></img>' +
				'<figcaption class="ck-placeholder ck-editable ck-hidden" contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>'
			);
		} );

		it( 'should do nothing for other changes than insert', () => {
			setModelData( document, '<image src=""><caption>foo bar</caption></image>' );
			const image = document.getRoot().getChild( 0 );
			const batch = document.batch();

			document.enqueueChanges( () => {
				batch.setAttribute( image, 'alt', 'alt text' );
			} );

			expect( getModelData( document, { withoutSelection: true } ) ).to.equal(
				'<image alt="alt text" src=""><caption>foo bar</caption></image>'
			);
		} );
	} );

	describe( 'editing view', () => {
		it( 'image should have empty figcaption element when is selected', () => {
			setModelData( document, '[<image src=""><caption></caption></image>]' );

			expect( getViewData( viewDocument ) ).to.equal(
				'[<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-placeholder ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>]'
			);
		} );

		it( 'image should have empty figcaption element with hidden class when not selected', () => {
			setModelData( document, '[]<image src=""><caption></caption></image>' );

			expect( getViewData( viewDocument ) ).to.equal(
				'[]<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-placeholder ck-editable ck-hidden" contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not add additional figcaption if one is already present', () => {
			setModelData( document, '[<image src=""><caption>foo bar</caption></image>]' );

			expect( getViewData( viewDocument ) ).to.equal(
				'[<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">foo bar</figcaption>' +
				'</figure>]'
			);
		} );

		it( 'should add hidden class to figcaption when caption is empty and image is no longer selected', () => {
			setModelData( document, '[<image src=""><caption></caption></image>]' );

			document.enqueueChanges( () => {
				document.selection.removeAllRanges();
			} );

			expect( getViewData( viewDocument ) ).to.equal(
				'[]<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-placeholder ck-editable ck-hidden" contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not remove figcaption when selection is inside it even when it is empty', () => {
			setModelData( document, '<image src=""><caption>[foo bar]</caption></image>' );

			document.enqueueChanges( () => {
				document.batch().remove( document.selection.getFirstRange() );
			} );

			expect( getViewData( viewDocument ) ).to.equal(
				'<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" contenteditable="true" data-placeholder="Enter image caption">' +
						'[]' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not remove figcaption when selection is moved from it to its image', () => {
			setModelData( document, '<image src=""><caption>[foo bar]</caption></image>' );
			const image = document.getRoot().getChild( 0 );

			document.enqueueChanges( () => {
				document.batch().remove( document.selection.getFirstRange() );
				document.selection.setRanges( [ ModelRange.createOn( image ) ] );
			} );

			expect( getViewData( viewDocument ) ).to.equal(
				'[<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>]'
			);
		} );

		it( 'should not remove figcaption when selection is moved from it to other image', () => {
			setModelData( document, '<image src=""><caption>[foo bar]</caption></image><image src=""><caption></caption></image>' );
			const image = document.getRoot().getChild( 1 );

			document.enqueueChanges( () => {
				document.selection.setRanges( [ ModelRange.createOn( image ) ] );
			} );

			expect( getViewData( viewDocument ) ).to.equal(
				'<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">foo bar</figcaption>' +
				'</figure>' +
				'[<figure class="image ck-widget" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-placeholder ck-editable" contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>]'
			);
		} );

		describe( 'undo/redo integration', () => {
			it( 'should create view element after redo', () => {
				setModelData( document, '<image src=""><caption>[foo bar baz]</caption></image>' );

				const modelRoot = document.getRoot();
				const modelImage = modelRoot.getChild( 0 );
				const modelCaption = modelImage.getChild( 0 );

				// Remove text and selection from caption.
				document.enqueueChanges( () => {
					const batch = document.batch();

					batch.remove( ModelRange.createIn( modelCaption ) );
					document.selection.removeAllRanges();
				} );

				// Check if there is no figcaption in the view.
				expect( getViewData( viewDocument ) ).to.equal(
					'[]<figure class="image ck-widget" contenteditable="false">' +
						'<img src=""></img>' +
						'<figcaption class="ck-editable ck-hidden ck-placeholder" contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);

				editor.execute( 'undo' );

				// Check if figcaption is back with contents.
				expect( getViewData( viewDocument ) ).to.equal(
					'<figure class="image ck-widget" contenteditable="false">' +
						'<img src=""></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'{foo bar baz}' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'undo should work after inserting the image', () => {
				const image = new ModelElement( 'image' );

				setModelData( document, '[]' );

				document.enqueueChanges( () => {
					const batch = document.batch();

					batch.insert( document.selection.anchor, image );
				} );

				editor.execute( 'undo' );

				expect( getModelData( document ) ).to.equal(
					'[]'
				);
			} );
		} );
	} );
} );
