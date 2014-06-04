/*
 * wiki.js
 * Scripts for the wiki app.
 *
 */
(function ($, win, doc) {
    'use strict';

    /*
        Initialization of the CKEditor widget
    */
    (function() {
        var $textarea = $('#id_content');

        // CKEditor setup method
        var setup = function() {
          var $appBoxes = $('.approved .boxed');
          var $tools = $('div.cke_toolbox');
          var $container = $('.ckeditor-container');
          var $content = $('#cke_id_content');
          var contentTop = $container.offset().top;
          var fixed = false;

          // Switch header and toolbar styles on scroll to keep them on screen
          $(doc).on('scroll', function() {

            // If top of the window is betwen top of #content and top of metadata (first .page-meta) blocks, the header is fixed
            var scrollTop = $(this).scrollTop();
            if (scrollTop >= contentTop) {

              // Need to display or hide the toolbar depending on scroll position
               if(scrollTop > $container.height() + contentTop - 200 /* offset to ensure toolbar doesn't reach content bottom */) {
                $tools.css('display', 'none');
                return; // Cut off at some point
               }
               else {
                $tools.css('display', '');
               }

               // Fixed position toolbar if scrolled down to the editor
               // Wrapped in IF to cut down on processing
              if (!fixed) {
                fixed = true;
                $tools.css({
                  position: 'fixed',
                  top: 0,
                  width: $content.width() - 11
                });
              }

            } else { // If not, header is relative, put it back
              if (fixed) {
                fixed = false;
                $tools.css({
                  position: 'relative',
                  top: 'auto',
                  width: 'auto'
                });
              }
            }
          });

          $(win).resize(function() { // Recalculate box width on resize
            if (fixed) {
              $tools.css({
                width: $container.width() - 10
              }); // Readjust toolbox to fit
            }
          });
       };

      // Renders the WYSIWYG editor
      $textarea.each(function () {
        if (!$('body').is('.is-template')) {
          $(this).removeAttr('required').ckeditor(setup, {
            customConfig : '/en-US/docs/ckeditor_config.js'
          });
        }
      });
    })();

    /*
        Calculate rendering max age in seconds from days, minutes and seconds
    */
    (function() {
        var seconds = $('#id_render_max_age').val();
        var getValue = function(selector) {
             return parseInt($(selector).val()) || 0;
        };

        $('.duration-container input').on('change', function() {
            $('#id_render_max_age').val(
                (((getValue('.duration-container #days') * 24) +
                getValue('.duration-container #hours')) * 60 +
                getValue('.duration-container #minutes')) * 60
            );
        });

        //convert seconds to days, hours, minutes
        var days = Math.round(seconds / (60 * 60 * 24));
        seconds -= days * (60 * 60 * 24);
        var hours = Math.round(seconds / (60 * 60));
        seconds -= hours * (60 * 60);
        var minutes = Math.round(seconds / 60);

        $('.duration-container #days').val(days);
        $('.duration-container #hours').val(hours);
        $('.duration-container #minutes').val(minutes);
    })();

  /*
    Plugin for prepopulating the slug fields
  */
  $.fn.prepopulate = function(dependencies, maxLength) {
      var _changed = '_changed';

      return this.each(function() {
          var $field = $(this);

          $field.data(_changed, false);
          $field.on(_changed, function() {
              $field.data(_changed, true);
          });

          var populate = function () {
              // Bail if the fields value has changed
              if ($field.data(_changed) == true) return;

              var values = [], field_val, field_val_raw, split;
              dependencies.each(function() {
                  if ($(this).val().length > 0) {
                      values.push($(this).val());
                  }
              });

              var s = values.join(' ');

              s = $.slugifyString(s);

              // Trim to first num_chars chars
              s = s.substring(0, maxLength);

              // Only replace the last piece (don't replace slug heirarchy)
              split = $field.val().split('/');
              split[split.length - 1] = s;
              $field.val(split.join('/'));
          };

          dependencies.on('keyup change focus', populate);
      });
  };

  /*
    Functionality to set up the new, edit, and translate pages
  */
    var DRAFT_NAME;
    var DRAFT_TIMEOUT_ID;

    var supportsLocalStorage = ('localStorage' in win);
    var formId = 'wiki-page-edit';
    var formSelector;
    var isTranslation;
    var isTemplate;

    function init() {
        var $body = $('body');
        var HEADERS = [ 'HGROUP', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6' ];

        $('select.enable-if-js').removeAttr('disabled');

        // If the form is a translate form, update the formId
        var translateFormId = 'translate-document';
        if($('#' + translateFormId).length) {
            formId = translateFormId;
            isTranslation = true;
        }
        formSelector = '#' + formId;

        if($body.hasClass('is-template')) {
            isTemplate = 1;
        }

        if ($body.is('.new')) {
            initPrepopulatedSlugs();
        }
        initDetailsTags();

        if ($body.is('.edit, .new, .translate')) {
            initMetadataEditButton();
            initSaveAndEditButtons();
            initArticlePreview();
            initAttachmentsActions();
            if(!isTemplate) {
                initDrafting();
            }
            initMetadataParentTranslation();
        }
        if ($body.is('.edit.is-template') || $body.is('.new.is-template')) {

            var textarea = $('textarea#id_content').hide();

            var editor = win.ace_editor = ace.edit('ace_content');
            editor.setTheme('ace/theme/dreamweaver');
            editor.setBehavioursEnabled(false);

            var JavaScriptMode = require('ace/mode/javascript').Mode;

            var session = editor.getSession();
            session.setMode(new JavaScriptMode());
            session.setValue(textarea.val());
            session.on('change', function(){
              textarea.val(editor.getSession().getValue());
            });
            $('.ace_text-input').focus();
            initDrafting();
        }
    }

    // Make <summary> and <details> tags work even if the browser doesn't support them.
    // From http://mathiasbynens.be/notes/html5-details-jquery
    function initDetailsTags() {
        var supportsDetails = ('open' in doc.createElement('details'));

        // Execute the fallback only if there's no native `details` support
        if (!supportsDetails) {
            // Note <details> tag support. Modernizr doesn't do this properly as of 1.5; it thinks Firefox 4 can do it, even though the tag has no "open" attr.
            $('details').addClass('no-details');

            // Loop through all `details` elements
            $('details').each(function() {
                // Store a reference to the current `details` element in a variable
                var $details = $(this),
                    // Store a reference to the `summary` element of the current `details` element (if any) in a variable
                    $detailsSummary = $('summary', $details),
                    // Do the same for the info within the `details` element
                    $detailsNotSummary = $details.children(':not(summary)'),
                    // This will be used later to look for direct child text nodes
                    $detailsNotSummaryContents = $details.contents(':not(summary)');

                // If there is no `summary` in the current `details` element...
                if (!$detailsSummary.length) {
                    // ...create one with default text
                    $detailsSummary = $(doc.createElement('summary')).text('Details').prependTo($details);
                }

                // Look for direct child text nodes
                if ($detailsNotSummary.length !== $detailsNotSummaryContents.length) {
                    // Wrap child text nodes in a `span` element
                    $detailsNotSummaryContents.filter(function() {
                        // Only keep the node in the collection if it's a text node containing more than only whitespace
                        return (this.nodeType === 3) && (/[^\t\n\r ]/.test(this.data));
                    }).wrap('<span>');
                    // There are now no direct child text nodes anymore -- they're wrapped in `span` elements
                    $detailsNotSummary = $details.children(':not(summary)');
                }

                // Hide content unless there's an `open` attribute
                if (typeof $details.attr('open') !== 'undefined') {
                    $details.addClass('open');
                    $detailsNotSummary.show();
                } else {
                    $detailsNotSummary.hide();
                }

                // Set the `tabindex` attribute of the `summary` element to 0 to make it keyboard accessible
                $detailsSummary.attr('tabindex', 0).on('click', function() {
                    // Focus on the `summary` element
                    $detailsSummary.focus();
                    // Toggle the `open` attribute of the `details` element
                    if (typeof $details.attr('open') !== 'undefined') {
                        $details.removeAttr('open');
                    }
                    else {
                        $details.attr('open', 'open');
                    }
                    // Toggle the additional information in the `details` element
                    $detailsNotSummary.slideToggle();
                    $details.toggleClass('open');
                }).on('keyup', function(event) {
                    if (13 === event.keyCode || 32 === event.keyCode) {
                        // Enter or Space is pressed -- trigger the `click` event on the `summary` element
                        // Opera already seems to trigger the `click` event when Enter is pressed
                        if (!($.browser.opera && 13 === event.keyCode)) {
                            event.preventDefault();
                            $detailsSummary.click();
                        }
                    }
                });
            });
        }
    }

    function initPrepopulatedSlugs() {
        var fields = {
            title: {
                id: '#id_slug',
                dependency_ids: ['#id_title'],
                dependency_list: ['#id_title'],
                maxLength: 50
            }
        };

        $.each(fields, function(i, field) {
            $(field.id).addClass('prepopulated_field');
            $(field.id).data('dependency_list', field.dependency_list)
                   .prepopulate($(field.dependency_ids.join(',')),
                                field.maxLength);
        });
    }

    /*
     * Initialize the article preview functionality.
     */
    function initArticlePreview() {
        $('#btn-preview').on('click', function(e) {
            e.preventDefault();

            // Ensure that content is available and exists
            var title = ' ';
            var $titleNode = $('#id_title');
            var data;

            if(CKEDITOR.instances['id_content']) {
                data = $.trim(CKEDITOR.instances['id_content'].getSnapshot());
            }
            else if(ace_editor && ace_editor) {
                data = $.trim(ace_editor.getSession().getValue());
            }
            else {
                return;
            }
            if($titleNode.length) {
                title = $titleNode.val();
            }

            // Since we have content, we can launch!
            if(data) {
                // Create and inject form for preview submission
                var $form = $("<form action='" + $(this).attr("data-preview-url") + "' target='previewWin' method='POST' />").appendTo(document.body);
                $("<input type='hidden' name='content' />").val(data).appendTo($form);
                $("<input type='hidden' name='title' />").val(title).appendTo($form);

                // Add the CSRF ?
                $('input[name=csrfmiddlewaretoken]').clone().appendTo($form);

                // Submit the form, and then get rid of it
                $form.get(0).submit();
                $form.remove();
            }

            return false;
        });
    }

    //
    // Initialize logic for metadata edit button.
    //
    function initMetadataEditButton () {

        if ($('#article-head .metadata').length) {
            var show_meta = function (ev) {
                // Disable and hide the save-and-edit button when editing
                // metadata, since that can change the URL of the page and
                // tangle up where the iframe posts.
                ev.preventDefault();
                $('#article-head .title').hide();
                $('#article-head .metadata').show();
                $('#article-head .metadata #id_title').focus();
            }

            // Properties button reveals the metadata fields
            $('#btn-properties').on('click', show_meta);
            // Form errors reveal the metadata fields, since they're the most
            // likely culprits
            $('#edit-document .errorlist').each(show_meta);

        } else {
            $('#btn-properties').hide();
        }
    }

    //
    // Initialize logic for metadata parent translation
    //
    function initMetadataParentTranslation() {
        var $parentLis = $('.metadata-choose-parent');
        var $parentInput = $('#parent_id');

        $parentLis.each(function(index) {
            $(this).css('display', 'block');
            $('#parent_text').mozillaAutocomplete({
                minLength: 1,
                requireValidOption: true,
                autocompleteUrl: mdn.wiki.autosuggestTitleUrl,
                _renderItemAsLink: true,
                buildRequestData: function(req) {
                    req.locale = 'en-US';
                    return req;
                },
                onSelect: function(item, isSilent) {
                    $parentInput.val(item.id);
                },
                onDeselect: function(item) {
                    $parentInput.val('');
                }
            });
        });
    }

    //
    // Generates a storage key to be used by new, edit, translate, and translate-edit purposes
    // Ensures same key used by all functionalities in this file
    // Uses slashes as delimiters because they can't be used in slugs to edge name clashes based on
    // slug can be prevented
    //
    function getStorageKey() {
        var noEdit = location.pathname.replace('$edit', '');
        var finalKey;

        if(isTranslation) { // Translation interface
            finalKey = 'draft/translate' + noEdit + '/' + location.search.replace('?tolocale=', '');
            finalKey = finalKey.replace('$translate', '');
        }
        else if($('#id_current_rev').val()) { // Edit
            finalKey = 'draft/edit' + noEdit;
        }
        else { // New
            finalKey = 'draft/new';
        }

        // Add another identifier for templates
        if(isTemplate) {
            finalKey += '/template';
        }

        finalKey = $.trim(finalKey);
        return finalKey;
    }

    // Injects a DIV with language to the effect of "you had a previous draft, want to restore it?"
    // This takes the place of an ugly, ugly confirmation box :(
    var $draftDiv;
    function displayDraftBox(content) {
        var text = gettext('You have a draft in progress.  <a href="" class="restoreLink">Restore the draft content</a> or <a href="" class="discardLink">discard the draft</a>.');
        var $contentNode = $('#id_content');
        var editor;

        // Plan the draft into the page
        $draftDiv = $('<div class="notice"><p>' + text + '</p></div>').insertBefore($contentNode);

        // Hook up the "restore" link
        $draftDiv.find('.restoreLink').on('click', function(e) {
            e.preventDefault();
            $contentNode.val(content);

            if(isTemplate) {
                editor = ace_editor;
                ace_editor.session.setValue(content);
            }
            else {
                editor = $contentNode.ckeditorGet();
                editor.setData(content);
            }
            editor.focus();

            updateDraftState('loaded');
            hideDraftBox();
        });

        // Hook up the "dispose" link
        $draftDiv.find('.discardLink').on('click', function(e) {
            e.preventDefault();
            hideDraftBox();
            clearDraft();
        });
    }
    function hideDraftBox() {
        $draftDiv && $draftDiv.css('display', 'none');
    }


    //
    // Initialize logic for save and save-and-edit buttons.
    //
    function initSaveAndEditButtons () {
        // Save button submits to top-level
        $('#btn-save').on('click', function () {
            if (supportsLocalStorage) {
                // Clear any preserved content.
                clearDraft();
            }
            clearTimeout(DRAFT_TIMEOUT_ID);
            $(formSelector)
                .attr('action', '')
                .removeAttr('target');
            return true;
        });

        // Save-and-edit submits to a hidden iframe, show loading message in notifier
        var notifier = $('.notifier').mozNotifier();
        $('#btn-save-and-edit').on('click', function () {

            notifier.setMessage('Saving changes…').show();

            mdn.analytics.trackEvent({
                category: 'Wiki',
                action: 'Save and Continue',
                label: window.location.href
            });

            var savedTa = $(formSelector + ' textarea[name=content]').val();
            if (supportsLocalStorage) {
                // Preserve editor content, because saving to the iframe can
                // yield things like 403 / login-required errors that bust out
                // of the frame
                saveDraft(savedTa);
            }
            clearTimeout(DRAFT_TIMEOUT_ID);
            // Redirect the editor form to the iframe.
            $(formSelector)
                .attr('action', '?iframe=1')
                .attr('target', 'save-and-edit-target');
            return true;
        });
        $('#btn-save-and-edit').show();

        $('#save-and-edit-target').on('load', function () {
            notifier.success().hide();

            if (supportsLocalStorage) {
                var if_doc = $(this).get(0).contentDocument;
                if (typeof(if_doc) != 'undefined') {

                    var ir = $('#iframe-response', if_doc);
                    if ('OK' == ir.attr('data-status')) {

                        // Dig into the iframe on load and look for "OK". If found,
                        // then it should be safe to throw away the preserved content.
                        localStorage.removeItem(DRAFT_NAME);

                        // We also need to update the form's current_rev to
                        // avoid triggering a conflict, since we just saved in
                        // the background.
                        $(formSelector + ' input[name=current_rev]').val(
                            ir.attr('data-current-revision'));

                    } else if ($(formSelector, if_doc).hasClass('conflict')) {
                        // HACK: If we detect a conflict in the iframe while
                        // doing save-and-edit, force a full-on save in order
                        // to surface the issue. There's no easy way to bust
                        // the iframe otherwise, since this was a POST.
                        $(formSelector)
                            .attr('action', '')
                            .attr('target', '');
                        $('#btn-save').click();

                    }

                    // Anything else that happens (eg. 403 errors) should have
                    // framebusting code to escape the hidden iframe.
                }
            }
            // Stop loading state on button
            $('#btn-save-and-edit').removeClass('loading');
            // Clear the review comment
            $('#id_comment').val('');
            // Re-enable the form; it gets disabled to prevent double-POSTs
            $(formSelector)
                .data('disabled', false)
                .removeClass('disabled');
            return true;
        });

    }

    function updateDraftState(action) {
        var now = new Date();
        var nowString = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

        $('#draft-action').text(action);
        $('#draft-time').attr('title', now.toISOString()).text(nowString);
    }

    function saveDraft(val) {
        if (supportsLocalStorage) {
            localStorage.setItem(DRAFT_NAME, val || $(formSelector + ' textarea[name=content]').val());
            updateDraftState(gettext('saved'));
        }
    }

    function clearDraft() {
        if (supportsLocalStorage) {
           localStorage.removeItem(DRAFT_NAME);
        }
    }

    function initDrafting() {
        var editor;
        DRAFT_NAME = getStorageKey();
        if (supportsLocalStorage) {
            var prev_draft = localStorage.getItem(DRAFT_NAME),
                treatDraft = function(content) {
                    return (content || '').replace(/ /g, '&nbsp;');
                },

                treatedDraft = $.trim(treatDraft(prev_draft)),
                treatedServer = treatDraft($(formSelector + ' textarea[name=content]').val().trim());
            if (prev_draft){
                // draft matches server so discard draft
                if (treatedDraft == treatedServer) {
                    clearDraft();
                } else {
                    displayDraftBox(prev_draft);
                }
            }
        }

        // Add key listener for CKEditor and drafting
        var callback = function() {
            clearTimeout(DRAFT_TIMEOUT_ID);
            DRAFT_TIMEOUT_ID = setTimeout(saveDraft, 3000);
        };
        if(isTemplate) {
            ace_editor.on && ace_editor.on('change', callback);
        }
        else {
            try {
                var $content = $('#id_content');
                $content.ckeditorGet && $content.ckeditorGet().on('key', callback);
            }
            catch(e) {
                console.log(e);
            }
        }

        // Clear draft upon discard
       $('#btn-discard').on('click', function() {
            clearTimeout(DRAFT_TIMEOUT_ID);
           clearDraft();
       });
    }

    function initAttachmentsActions() {
        var $attachmentsTable = $('#page-attachments-table');
        var $attachmentsCount = $('#page-attachments-count');
        var $attachmentsButton = $('#page-attachments-button');
        var $attachmentsNoMessage = $('#page-attachments-no-message');
        var $attachmentsNewTable = $('#page-attachments-new-table');
        var $attachmentsForm = $('#page-attachments-form');
        var $attachmentsFormCloneRow = $attachmentsNewTable.find('tbody tr').first();
        var $attachmentsNewTableActions = $attachmentsNewTable.find('tbody tr').last();
        var $pageAttachmentsSpinner = $('#page-attachments-spinner');
        var $iframe = $('#page-attachments-upload-target');
        var uploadFormTarget = $attachmentsForm.length && $attachmentsForm.attr('action');
        var running = false;

        // If no attachments table, get out -- no permissions
        if(!$attachmentsTable.length) {
            return;
        }

        // Upon click of the 'Attach Files' button, toggle display of upload table
        $attachmentsButton.on('click', function(e) {
            e.preventDefault();
            $attachmentsNewTable.toggleClass('hidden');
            if(!$attachmentsNewTable.hasClass('hidden')) {
                $attachmentsNewTable.find('input[type=text]').first()[0].focus();
            }
        });

        // Clicking the 'AMF' button adds more rows
        $('#page-attachments-more').on('click', function() {
            // Don't add boxes during submission
            if(running) return;
            function clone() {
                // Create and insert clone
                var $clone = $attachmentsFormCloneRow.clone();
                $clone.find('input, textarea').val('');
                $clone.find('.attachment-error').remove();
                $clone.insertBefore($attachmentsNewTableActions);
                $clone.addClass('dynamic-row');

                // Show the cell actions now!
                $attachmentsNewTable.find('.page-attachment-actions-cell').removeClass('hidden');
                $clone.find('.delete-attachment').removeClass('hidden');

                return $clone;
            }
            clone().find('input[type="text"]')[0].focus();
        });

        // Add an "ajax" parameter to the form for the sake of the server
        $("<input type='hidden' name='is_ajax' value='1' />").appendTo($attachmentsForm);

        // Submitting the form posts to mystical iframe
        $iframe.on('load', function(e) {
            running = false;
            $attachmentsForm.data('disabled', false).removeClass('disabled');

            // Handle results
            try {
                var $textarea = $iframe.contents().find('textarea').first();
                var validIndexes = [];
                var invalidIndexes = [];
                var $dynamicRows;
                var result;

                if($textarea.length) {
                    // Get JSON
                    result = JSON.parse($.trim($textarea.val()));
                    // Add error messages where needed, or hide all new rows
                    $dynamicRows = $attachmentsNewTable.find('.dynamic-row');
                    // Add the row to the table
                    $.each(result, function(i) {
                        // If valid....
                        if(this.id) {
                            // Add to uploads table
                            var $newTr = $(this.html);
                            $newTr.appendTo($attachmentsTable);
                            $newTr.addClass('new-row');
                            // Update attachment count
                            $attachmentsCount.text(parseInt($attachmentsCount.text(), 10) + 1);
                            // Add item to list
                            if(mdn.wiki.attachments) {
                                mdn.wiki.attachments.push(this);
                            }
                            validIndexes.push(i);
                            // Remove the form row
                            if(!i) { // First row
                                $attachmentsFormCloneRow.find('input, textarea').val('');
                            }
                            else {
                                var node = $dynamicRows.eq(i)[0];
                                $dynamicRows[i] = '';
                                node.parentNode.removeChild(node);
                            }
                        }
                        else { // Error!
                            invalidIndexes.push(i);
                        }

                    });

                    // Hide the 'no rows' paragraph, show table
                    $attachmentsNoMessage.addClass('hidden');
                    $attachmentsTable.removeClass('hidden');

                    // If all good, we can reset the form
                    if(validIndexes.length == result.length) {
                        // Reset the entire form
                        $attachmentsForm[0].reset();
                        $dynamicRows.remove();
                    }
                    else { // We have to cherry pick which were good and which were bad
                        $.each(invalidIndexes, function() {
                            if(this == 0) {
                                // Add message to the clone row
                                $('<div class="attachment-error"></div>')
                                    .appendTo($attachmentsFormCloneRow.find('.page-attachment-actions-file-cell'))
                                    .text(result[this]['error'])
                            }
                        });
                    }
                }
                else {
                    // Show error message?
                    console.warn('No textarea')
                }
            }
            catch(e) {
                // Show error message?
                console.warn('Exception! ', e);
            }
            $pageAttachmentsSpinner.css('opacity', 0);
        });

        // Form submission, upload, and response handling
        $attachmentsForm.attr('target', 'page-attachments-upload-target').on('submit', function(e) {
            // Stop concurrent submissions
            if(running) return;
            // Hide all error messages
            $attachmentsNewTable.find('.attachment-error').remove();
            // IE....
            var valid = true;
            $attachmentsNewTable.find('input[required], textarea[required]').each(function() {
                var $this = $(this);
                if($this.val() == '') {
                    e.preventDefault();
                    e.stopPropagation();
                    $this.addClass('attachment-required');
                    valid = false;
                }
                else {
                    $this.removeClass('attachment-required');
                }
            });
            if(!valid) {
                running = false;
                setTimeout(function() { $attachmentsForm.data('disabled', false); }, 200);
                return;
            }

            // Show the spinner
            $pageAttachmentsSpinner.css('opacity', 1);
        });
    }

    $(doc).ready(init);

 }(jQuery, window, document));
